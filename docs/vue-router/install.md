# VueRouter 插件的安装

`vue-router`做为`vue`的官方插件，使用`Vue.use`方法来进行安装，而`Vue.use`方法实际是调用了组件的`install`方法，这个方法定义在项目的`src/install.js`文件中

```js
export function install(Vue) {
  if (install.installed && _Vue === Vue) return;
  install.installed = true;

  _Vue = Vue;

  const isDef = (v) => v !== undefined;

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode;
    if (
      isDef(i) &&
      isDef((i = i.data)) &&
      isDef((i = i.registerRouteInstance))
    ) {
      i(vm, callVal);
    }
  };

  Vue.mixin({
    beforeCreate() {
      if (isDef(this.$options.router)) {
        this._routerRoot = this;
        this._router = this.$options.router;
        this._router.init(this);
        Vue.util.defineReactive(this, '_route', this._router.history.current);
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
      }
      registerInstance(this, this);
    },
    destroyed() {
      registerInstance(this);
    },
  });

  Object.defineProperty(Vue.prototype, '$router', {
    get() {
      return this._routerRoot._router;
    },
  });

  Object.defineProperty(Vue.prototype, '$route', {
    get() {
      return this._routerRoot._route;
    },
  });

  Vue.component('RouterView', View);
  Vue.component('RouterLink', Link);

  const strats = Vue.config.optionMergeStrategies;
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter =
    strats.beforeRouteLeave =
    strats.beforeRouteUpdate =
      strats.created;
}
```

代码的核心逻辑分 3 点

- 调用`Vue.mixin`混入 2 个生命周期钩子
- 在`Vue`的原型对象`Vue.prototype`中定义了`$route` `$router`2 个属性
- 全局注册了`RouterView` `RouterLink`2 个组件

## 生命周期钩子

```js
beforeCreate () {
    if (isDef(this.$options.router)) {
      this._routerRoot = this
      this._router = this.$options.router
      this._router.init(this)
      Vue.util.defineReactive(this, '_route', this._router.history.current)
    } else {
      this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
    }
    registerInstance(this, this)
},
destroyed () {
    registerInstance(this)
}
```

这段代码首先判断了当前`vue`实例的`$options`对象上有无`router`属性，如有，则说明该实例是`vue`的根实例。初始化属性`_routerRoot`为当前`vue`根实例，接着为根实例添加`_router` `route`属性，再调用`router`对象的`init`方法，`init`方法我们后面再分析。若当前实例不是根实例，则从父组件上获取到根路由对象并赋值。接着调用`registerInstance`方法

```js
const registerInstance = (vm, callVal) => {
  let i = vm.$options._parentVnode;
  if (isDef(i) && isDef((i = i.data)) && isDef((i = i.registerRouteInstance))) {
    i(vm, callVal);
  }
};
```

这个方法是调用定义在父组件`vnode`上的`registerRouteInstance`方法，这是`router-view`组件中定义的方法，后面在具体分析

`destroyed`钩子也是调用了`registerInstance`方法，后面分析组件在提

## $router & $route

由代码得知，这2个属性其实就是当前`vue`根实例上的2个属性，分别指向根实例的`_router` `_route`属性。他们的关系是`$router.history.current === $route`，`$router` 其实就是`VueRouter`这个对象的实例

## 全局组件

后面说到路由组件再具体分析

## 其他

`install`方法的最后对`beforeRouteEnter` `beforeRouteLeave` `beforeRouteUpdate` 这 3 个组件内的路由钩子的合并策略做了初始化。完全等同于 `created` 钩子的合并策略

## 总结

`install` 的方法很简单

- 首先全局混入了`beforeCreate`和`destroyed`2 个生命周期钩子，负责处理路由相关的属性初始化和实例的注册和销毁
- 暴露了 2 个`vue`组件属性`$route` `$router`方便我们使用
- 全局注册了`router-view` `router-link`2 个组件
- 对`beforeRouteEnter` `beforeRouteLeave` `beforeRouteUpdate` 这 3 个组件内的路由钩子的合并策略做了初始化
