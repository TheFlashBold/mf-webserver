const {exec} = require('child_process');
const koaRouter = require('koa-router');
const koaBody = require('koa-body');
const {Module} = require('mf-lib');
const path = require('path');
const ejs = require('ejs');
const koa = require('koa');
const fs = require('fs');

class WebServerModule extends Module {
    _instances = {};

    async init() {
        const instances = this.config.get('instances', {});
        Object.entries(instances).map(this._initWebServer.bind(this));
    }

    async initModule(module) {
        if (module.data && module.data.mounts) {
            Object.entries(module.data.mounts)
                .map(([uriPath, folder]) => this.serveFolder(uriPath, folder));
        }
    }

    _initWebServer([name, cfg]) {
        const {port} = this._normalizeConfig(cfg);
        const router = new koaRouter();
        const app = new koa();

        this.initContext(app.context);
        app.use(koaBody());
        app.use(router.routes());
        app.listen(port);

        this._instances[name] = app;
        this._instances[name].router = router;

        this.log.info('started webserver', name, 'on', port);
    }

    initContext(ctx) {
        ctx.renderTemplate = this.renderTemplate.bind(this);
        ctx.application = this.app;
        // @TODO add acl and auth?
        ctx.can = (action, onWhat) => {
            return true;
            /*const err = new Error('Unauthorized');
            err.status = 401;
            throw err;*/
        }
    }

    /**
     * @param cfg
     * @return {object}
     * @private
     */
    _normalizeConfig(cfg) {
        return Object.assign({
            port: 3000
        }, cfg);
    }

    /**
     * @param templatePath
     * @param data
     * @param options
     * @return {Promise<string>}
     */
    async renderTemplate(templatePath, data, options = {}) {
        if (Array.isArray(templatePath)) {
            templatePath = path.resolve(...templatePath);
        }
        return new Promise((resolve, reject) => {
            ejs.renderFile(templatePath, data, options, (err, html) => {
                if (err) {
                    return reject(err);
                }
                resolve(html);
            });
        });
    }

    /**
     *
     * @param instance
     * @return {koaRouter.middleware|Object}
     */
    getRouter(instance = 'default') {
        if (!this._instances[instance]) {
            this.log.error('Router', instance, 'not found');
            throw new Error('Router ' + instance + ' not found');
        }
        return this._instances[instance].router;
    }

    /**
     * @param path
     * @param fnc
     * @param method
     * @param instance
     */
    registerRoute(path, fnc, method = 'get', instance = 'default') {
        const router = this.getRouter(instance);
        router[method](path, fnc);
    }

    /**
     * Serve a folder under a uriPath
     * @param {string} uriPath
     * @param {string} folder
     * @param {string} instance
     */
    serveFolder(uriPath, folder, instance = 'default') {
        this.log.info('registering public dir', folder, uriPath);
        const router = this.getRouter(instance);
        router.get(uriPath + '*', async (ctx, next) => {
            let filePath = path.join(folder, decodeURI(ctx.path.replace(uriPath, '')));
            if (!fs.existsSync(filePath)) {
                return next();
            }
            if (fs.lstatSync(filePath).isDirectory()) {
                const indexPath = path.join(filePath, 'index.html');
                if (fs.existsSync(path.join(filePath, 'index.html'))) {
                    filePath = indexPath;
                } else {
                    return next();
                }
            }
            return this._serveFile(filePath, ctx, next);
        });
    }

    async _serveFile(filePath, ctx, next) {
        ctx.type = await new Promise((resolve) => {
            return exec('file -b --mime-type "' + filePath + '"', (err, stdout) => {
                if (err) {
                    return resolve('');
                }
                resolve(String(stdout).trim());
            });
        });

        const stats = fs.statSync(filePath);

        ctx.status = 200;
        ctx.lastModified = stats.mtime;
        ctx.length = stats.size;

        const fresh = ctx.request.fresh;
        switch (ctx.request.method) {
            case 'HEAD':
                ctx.status = fresh ? 304 : 200;
                break;
            case 'GET':
                if (fresh) {
                    ctx.response.status = 304
                } else {
                    ctx.body = fs.createReadStream(filePath);
                }
                break;
        }
        this.log.info('Serving', ctx.path, 'from', filePath, ctx.type);
    }
}

module.exports = WebServerModule;
