const koaRouter = require('koa-router');
const koaBody = require('koa-body');
const {Module} = require('mf-lib');
const path = require('path');
const ejs = require('ejs');
const koa = require('koa');

class WebServerModule extends Module {
    _instances = {};

    async init() {
        const instances = this.config.get('instances', {});
        console.log(instances)
        Object.entries(instances).map(this._initWebServer.bind(this));
    }

    async initModule(module) {

    }

    _initWebServer([name, cfg]) {
        const {port} = this._getConfig(cfg);
        const router = new koaRouter();
        const app = new koa();

        //app.use(this.initMiddleWares.bind(this));
        app.use(koaBody());
        app.use(router.routes());
        app.listen(port);

        this._instances[name] = app;
        this._instances[name].router = router;

        this.log.info("started webserver", name, "on port", port);
    }

    initMiddleWares(ctx, next) {
        ctx.renderTemplate = async (templatePath, data, options = {}) => {
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
        };
        next();
    }

    _getConfig(cfg) {
        return Object.assign({
            port: 3000
        }, cfg);
    }

    /**
     *
     * @param instance
     * @return {koaRouter.middleware|Object}
     */
    getRouter(instance = "default") {
        if (!this._instances[instance]) {
            this.log.error("Router", instance, "not found");
            throw new Error("Router " + instance + " not found");
        }
        return this._instances[instance].router;
    }

    /**
     * @param path
     * @param fnc
     * @param method
     * @param instance
     */
    registerRoute(path, fnc, method = "get", instance = "default") {
        const router = this.getRouter(instance);
        router[method](path, fnc);
    }
}

module.exports = WebServerModule;
