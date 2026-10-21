import { registerHooks } from "node:module";

// Next/TypeScript resolve extensionless source imports; plain Node needs the suffix.
// Used only by Node tests that import the actual schemas, serializers, or store.
registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (error.code === "ERR_MODULE_NOT_FOUND" &&
                /^\.{1,2}\//.test(specifier) &&
                !/\.[a-z]+$/i.test(specifier)) {
                return nextResolve(`${specifier}.ts`, context);
            }
            throw error;
        }
    },
});
