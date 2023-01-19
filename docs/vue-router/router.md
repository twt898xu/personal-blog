# Router 对象实例化

在使用`vue-router`时，首先会调用`new VueRouter`来实例化一个`router`对象，`VueRouter`的构造函数在项目的`src/router.js`文件中

## 构造函数

```js
export default class {
  constructor(options: RouterOptions = {}) {
    
    this.app = null;
    this.apps = [];
    this.options = options;
    this.beforeHooks = [];
    this.resolveHooks = [];
    this.afterHooks = [];
    this.matcher = createMatcher(options.routes || [], this);

    let mode = options.mode || 'hash';
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false;
    if (this.fallback) {
      mode = 'hash';
    }
    if (!inBrowser) {
      mode = 'abstract';
    }
    this.mode = mode;

    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base);
        break;
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback);
        break;
      case 'abstract':
        this.history = new AbstractHistory(this, options.base);
        break;
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`);
        }
    }
  }
}
```

分析下构造函数，共处理了以下几个事情

- 初始化对象的`matcher`属性
- 根据不同场景确认对象`model`属性
- 根据`model`不同，实例化了对象`history`属性

## matcher

`createMatcher`对应的代码在`src/create-matcher.js`内，先分析部分核心代码

```js
export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {

    const { pathList, pathMap, nameMap } = createRouteMap(routes)

    function match(){},
    function addRoute(){},
    function getRoutes(){},
    function addRoutes(){},
    return {
      match,
      addRoute,
      getRoutes,
      addRoutes
    }
}
```
可以看到，该方法内部调用了`createRouteMap`方法，然后返回了一个包含4个函数的对象。这里分析下`createRouteMap`这个方法

```js
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>,
  parentRoute?: RouteRecord
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {
  // the path list is used to control path matching priority
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  // ensure wildcard routes are always at the end
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}
```
这里首先初始化了`pathList` `pathMap` `nameMap`这3个变量，然后循环传入的`routes`配置，调用`addRouteRecord`方法。

接着处理通配符`*`，通过循环`pathList`来确保`*`始终保持在数组的最后。逻辑也很简单，如果匹配到通配符，则先将该通配符移除数组，再添加到数组的最后一位。同时将前后2个指针，向前移动一位。这样即可确保通配置路由在数组的最后位置。最后在返回之前定义的3个变量。

接着看下`addRouteRecord`的实现
```js
function addRouteRecord(
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string,
) {
  const { path, name } = route;

  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {};
  const normalizedPath = normalizePath(
    path,
    parent,
    pathToRegexpOptions.strict,
  );

  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive;
  }

  const record: RouteRecord = {
    path: normalizedPath,
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component },
    alias: route.alias
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [],
    instances: {},
    enteredCbs: {},
    name,
    parent,
    matchAs,
    redirect: route.redirect,
    beforeEnter: route.beforeEnter,
    meta: route.meta || {},
    props:
      route.props == null
        ? {}
        : route.components
        ? route.props
        : { default: route.props },
  };

  if (route.children) {
    route.children.forEach((child) => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined;
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs);
    });
  }

  if (!pathMap[record.path]) {
    pathList.push(record.path);
    pathMap[record.path] = record;
  }

  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias];
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i];
      const aliasRoute = {
        path: alias,
        children: route.children,
      };
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/', // matchAs
      );
    }
  }

  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record;
    }
  }
}
```
首先调用了`normalizePath`方法，得到规范化的`path`。核心就是添加`parent path`，处理空格，处理最后的`/`等，比较简单

接着定义变量`record`，这里看下`compileRouteRegex`方法，这个方法主要调用了`path-to-regexp`这个库来生成正则，不做具体分析。

接着循环`children`属性，递归的调用`addRouteRecord`方法，并传入当前环境中的`record`作为`parent`参数以及当前的`pathList` `pathMap` `nameMap`变量，这样就能把树形结构的配置打平成一个一维数组

接着判断当前`pathMap`有无当前环境下的`record`对象，如无，则添加到`pathList` `pathMap`中去

在接着处理路由的`alias`，就是循环`alias`,将`alias`作为`path`，循环调用`addRouteRecord`方法。注意，这里只传入的`route`对象只有`path`和`children`属性。这个的`addRouteRecord`方法传入了第6个参数`matchAs`，这个是用来做`alias`匹配的，后面会说到

最后将尝试将当前`record`添加到`nameMap`中去

至此，`pathList` `pathMap` `nameMap`就构建完成了。

## model

逻辑很简单，默认`model`为`hash`。如果用户传入的`model`是`history`,但当前不支持`pushState`且用户配置`fallback`成立，则回退为`hash`。若不在浏览器环境中`model`设置为`abstract`

## history

根据`model`的不同类型，实例化不同的路由对象，这里着重分析下`HashHistory`这一常用类型。相关代码位于`src/history/hash.js`内

```js
export class HashHistory extends History {
  constructor(router: Router, base: ?string, fallback: boolean) {
    super(router, base);
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return;
    }
    ensureSlash();
  }
}
```

这里暂前只分析构造函数相关内容。可以看到`HashHistory`首先是继承了`History`这个类，这个等下分析。

可以看见`HashHistory`的构造函数首先处理了`history`的`fallback`的情况。如果`fallback`为真，则调用`checkFallback`方法，这个方法核心就是，修改当前页面`location`为`hash`模式。

接着调用`ensureSlash`方法，这个方法确保`location`的结构是`/#/`,而不是`/#`

接着看下基类`History`的代码

```js
export class History {
  constructor(router: Router, base: ?string) {
    this.router = router;
    this.base = normalizeBase(base);
    // start with a route object that stands for "nowhere"
    this.current = START;
    this.pending = null;
    this.ready = false;
    this.readyCbs = [];
    this.readyErrorCbs = [];
    this.errorCbs = [];
    this.listeners = [];
  }
}
```

这里主要分析下`current`属性，这是一个`route`对象，当前为根路由`/`对象，`route`对象的结构如下：

```ts
declare type Route = {
  path: string;
  name: ?string;
  hash: string;
  query: Dictionary<string>;
  params: Dictionary<string>;
  fullPath: string;
  matched: Array<RouteRecord>;
  redirectedFrom?: string;
  meta?: any;
};
```

当前`current`属性为

```json
{
  "path": "/",
  "hash": "",
  "query": {},
  "params": {},
  "fullPath": "/",
  "matched": []
}
```

其余的之后分析

## 总结
- `VueRouter`在实例化时，首先初始化了`matcher`属性，这是一个匹配器，包含了4个方法，同时在匹配器创建时，完成了对`routes`的解析，生成了`pathList` `pathMap` `nameMap`3个私有变量，用来简化路由匹配
- 接着根据允许环境和`fallback`等配置确认路由的`model`
- 最后根据`model`来实例化了`history`属性。`HashHistory`继承与`History`。初始化阶段主要完成了对`location`的规范化操作
