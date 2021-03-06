pc.extend(pc.fw, function () {
    /**
    * @component
    * @name pc.fw.ScriptComponent
    * @class The ScriptComponent allows you to extend the functionality of an Entity by attaching your own javascript files
    * to be executed with access to the Entity. For more details on scripting see <a href="//developer.playcanvas.com/user-manual/scripting/">Scripting</a>.
    * @param {pc.fw.ScriptComponentSystem} system The ComponentSystem that created this Component
    * @param {pc.fw.Entity} entity The Entity that this Component is attached to.
    * @extends pc.fw.Component
    * @property {Boolean} enabled Enables or disables the Component. If the Component is disabled then the following methods will not be called on the script instances:
    * <ul>
    * <li>initialize</li>
    * <li>postInitialize</li>
    * <li>update</li>
    * <li>fixedUpdate</li>
    * <li>postUpdate</li>
    * </ul>
    * @property {Object[]} scripts An array of all the scripts to load. Each script object has this format:
    * {url: 'url.js', name: 'url', 'attributes': [attribute1, attribute2, ...]}
    */

    var ScriptComponent = function ScriptComponent(system, entity) {
        this.on("set_scripts", this.onSetScripts, this);
    };
    ScriptComponent = pc.inherits(ScriptComponent, pc.fw.Component);

    pc.extend(ScriptComponent.prototype, {
        /**
         * @function
         * @name pc.fw.ScriptComponent#send
         * @description Send a message to a script attached to the entity.
         * Sending a message to a script is similar to calling a method on a Script Object, except that the message will not fail if the method isn't present.
         * @param {String} name The name of the script to send the message to
         * @param {String} functionName The name of the function to call on the script
         * @returns The result of the function call
         * @example
         * // Call doDamage(10) on the script object called 'enemy' attached to entity.
         * entity.script.send('enemy', 'doDamage', 10);
         */
        send: function (name, functionName) {
            var args = pc.makeArray(arguments).slice(2);
            var instances = this.entity.script.instances;
            var fn;

            if(instances && instances[name]) {
                fn = instances[name].instance[functionName];
                if (fn) {
                    return fn.apply(instances[name].instance, args);
                }

            }
        },

        onEnable: function () {
            ScriptComponent._super.onEnable.call(this);

            // if the scripts of the component have been loaded
            // then call the appropriate methods on the component
            if (this.data.areScriptsLoaded) {
                if (!this.data.initialized) {
                    this.system._initializeScriptComponent(this);
                } else {
                    this.system._enableScriptComponent(this);
                }

                if (!this.data.postInitialized) {
                    this.system._postInitializeScriptComponent(this);
                }
            }
        },

        onDisable: function () {
            ScriptComponent._super.onDisable.call(this);
            this.system._disableScriptComponent(this);
        },

        onSetScripts: function(name, oldValue, newValue) {
            if (!this.system._inTools || this.runInTools) {
                var onlyUpdateAttributes = true;
                if (oldValue.length !== newValue.length) {
                    onlyUpdateAttributes = false;
                } else {
                    var i; len = newValue.length;
                    for (i=0; i<len; i++) {
                        if (oldValue[i].url !== newValue[i].url) {
                            onlyUpdateAttributes = false;
                            break;
                        }
                    }
                }

                if (onlyUpdateAttributes) {
                    for (var key in this.instances) {
                        if (this.instances.hasOwnProperty(key)) {
                            this.system._updateAccessors(this.entity, this.instances[key]);
                        }
                    }
                    return;
                }

                if (this.enabled) {
                    this.system._disableScriptComponent(this);
                }

                this.system._destroyScriptComponent(this);

                this.data.areScriptsLoaded = false;

                var scripts = newValue;
                var urls = scripts.map(function (s) {
                    return s.url;
                });

                // Load and register new scripts and instances
                var requests = urls.map(function (url) {
                    return new pc.resources.ScriptRequest(url);
                });
                var options = {
                    parent: this.entity.getRequest()
                };
                var promise = this.system.context.loader.request(requests, options);
                promise.then(function (resources) {
                    resources.forEach(function (ScriptType, index) {
                        // ScriptType may be null if the script component is loading an ordinary javascript lib rather than a PlayCanvas script
                        // Make sure that script component hasn't been removed since we started loading
                        if (ScriptType && this.entity.script) {
                            // Make sure that we haven't already instaciated another identical script while loading
                            // e.g. if you do addComponent, removeComponent, addComponent, in quick succession
                            if (!this.entity.script.instances[ScriptType._pcScriptName]) {
                                var instance = new ScriptType(this.entity);
                                this.system._preRegisterInstance(this.entity, urls[index], ScriptType._pcScriptName, instance);
                            }
                        }
                    }, this);

                    if (this.data) {
                        this.data.areScriptsLoaded = true;
                    }

                    // If there is no request batch, then this is not part of a load request and so we need
                    // to register the instances immediately to call the initialize function
                    if (!options.parent) {
                        this.system.onInitialize(this.entity);
                        this.system.onPostInitialize(this.entity);
                    }
                }.bind(this)).then(null, function (error) {
                    // Re-throw any exceptions from the Script constructor to stop them being swallowed by the Promises lib
                    setTimeout(function () {
                        throw error;
                    })
                });
            }
        }
    });

    return {
        ScriptComponent: ScriptComponent
    };
}());