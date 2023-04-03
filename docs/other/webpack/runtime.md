# Webpack 的 runtime 运行时浅析

通过一个例子来分析下Webpack在运行时的文件加载与执行过程
```js
// index.js entry
console.log('entry')
import(/* webpackChunkName: "sum" */'./sum.js').then(({sum})=>{
    console.log(sum(1,2)) 
})

// sum.js chunk
export function sum(a,b){
    return a + b
}
```
这个例子中入口文件按需依赖了一个chunk文件，剥离`runtime`进行打包后得到3个文件 
- 入口文件 `main.js`
- 运行时 `runtime.js`
- chunk 依赖 `sum.chunk.js`

## 运行时分析

先看下`runtime.js`的核心内容
```js
var __webpack_modules__ = ({});
var __webpack_module_cache__ = {};

(()=>{
    // installedChunks 
    // 0 表示当前的chunk已经加载完成
    // 未加载完成的话 存储的是 chunk 加载的promise [resolve,reject,promise]
    var installedChunks = {
        "runtime": 0
    }

    // parentChunkLoadingFunction 在当前场景下 就是原始的 Array.prototype.push 方法
    // data : chunk data
    var webpackJsonpCallback = (parentChunkLoadingFunction, data) => {
    	var [chunkIds, moreModules, runtime] = data;
    	var moduleId, chunkId, i = 0;
    	if(chunkIds.some((id) => (installedChunks[id] !== 0))) {
    		for(moduleId in moreModules) {
                // __webpack_require__.o 判断属性是否是对象自身属性
    			if(__webpack_require__.o(moreModules, moduleId)) {
                    // __webpack_require__.m === __webpack_modules__
    				__webpack_require__.m[moduleId] = moreModules[moduleId];
    			}
    		}
            // 执行chunk的运行时
    		if(runtime) var result = runtime(__webpack_require__);
    	}
        // 执行原始的push方法
    	if(parentChunkLoadingFunction) parentChunkLoadingFunction(data);
    	for(;i < chunkIds.length; i++) {
    		chunkId = chunkIds[i];
    		if(__webpack_require__.o(installedChunks, chunkId) && installedChunks[chunkId]) {
    			installedChunks[chunkId][0](); // 执行 installedChunks 中对应的 resolve 方法，完成chunk的加载
    		}
    		installedChunks[chunkId] = 0; // 标记chunk成已加载完成
    	}
        // 当前场景下直接返回 result
    	return __webpack_require__.O(result);
    }

    // 初始化一个全局对象下面 webpackJSONP 属性
    var chunkLoadingGlobal = self["webpackJSONP"] = self["webpackJSONP"] || [];
    // 对所有chunk执行 webpackJsonpCallback 方法
    chunkLoadingGlobal.forEach(webpackJsonpCallback.bind(null, 0));
    // 重写 chunkLoadingGlobal.push 方法
    chunkLoadingGlobal.push = webpackJsonpCallback.bind(null, chunkLoadingGlobal.push.bind(chunkLoadingGlobal));

})()
```
上面的代码除了函数的预定义外，核心就做了2件事情
1. 定义了全局的变量 `webpackJSONP`
2. 修改了全局变量的 `push`方法

接着看下入口chunk`main.js`的代码
```js
(self['webpackJSONP'] = self['webpackJSONP'] || []).push([['main'],{
    './src/index.js':(__unused_webpack_module,__unused_webpack_exports,__webpack_require__)=>{
        console.log('entry')
        __webpack_require__.e('sum')
            .then(__webpack_require__.bind(__webpack_require__,'./src/sum.js'))
            .then(({sum})=>{ console.log(sum(1, 2)); })
    }
},(__webpack_require__)=>{
    var __webpack_exec__ = (moduleId) => __webpack_require__((__webpack_require__.s = moduleId));
    var __webpack_exports__ = __webpack_exec__('./src/index.js');
}])
```
入口chunk都是通过`script`脚本加载到我们的页面中的，而`script`脚本在加载完成后就会执行。这样就会执行到`push`方法从而执行到`runtime`中的`webpackJsonpCallback`方法。而`webpackJsonpCallback`会执行chunk的`runtime`方法，就是执行上面代码定义的第3个参数
```js
(__webpack_require__)=>{
    var __webpack_exec__ = (moduleId) => __webpack_require__((__webpack_require__.s = moduleId));
    var __webpack_exports__ = __webpack_exec__('./src/index.js');
}
```
可以看到核心是执行了 `__webpack_require__('./src/index.js')` 这样的一行代码，看下`__webpack_require__`的实现
```js
// __webpack_require__ 
function __webpack_require__(moduleId) {
    // 首先找缓存
    // 返回缓存的 exports 属性
    var cachedModule = __webpack_module_cache__[moduleId];
    if (cachedModule !== undefined) {
	    return cachedModule.exports;
    }
    // 创建一个模块对象 并且加入到缓存对象中
    var module = __webpack_module_cache__[moduleId] = {
        exports: {}
    }
    // 从 __webpack_modules__ 找到对应的模块函数 并且执行
    __webpack_modules__[moduleId](module, module.exports, __webpack_require__);
    return module.exports;
}
```
可以看到其实`__webpack_require__`的核心就是从`__webpack_modules__`找到对应的模块函数并且执行。模块函数的逻辑在上面提到的`webpackJsonpCallback`方法中添加，其实就是chunk函数中对应的第二个参数
```js
{
    './src/index.js':(__unused_webpack_module,__unused_webpack_exports,__webpack_require__)=>{
        console.log('entry')
        __webpack_require__.e('sum')
            .then(__webpack_require__.bind(__webpack_require__,'./src/sum.js'))
            .then(({sum})=>{ console.log(sum(1, 2)); })
    }
}
```
可以看到，`./src/index.js`对应的其实就是一个函数。这个函数首先执行了`console.log('entry')`这段定义在`index.js`中的代码，接着调用`__webpack_require__.e`来实现按需加载的一个调用，来看下这个函数的实现
```js
__webpack_require__.f = {};
__webpack_require__.e = (chunkId) => {
	return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
		__webpack_require__.f[key](chunkId, promises);
		return promises;
	}, []));
};
```
可见此方法就是执行`__webpack_require__.f`对象中所有的方法，并将`chunkId`作为第一个参数传入，此场景下`__webpack_require__.f`只有一个方法属性
```js
__webpack_require__.f.j = (chunkId, promises) => {

    var installedChunkData = __webpack_require__.o(installedChunks, chunkId) ? installedChunks[chunkId] : undefined;
    // 0 表示已经加载完成
    if(installedChunkData !== 0) {
        // 如果chunk正在加载 直接返回对应的 promise
        if(installedChunkData) {
            promises.push(installedChunkData[2]);
        }else{
            // chunk 没有加载 且不是 runtime chunk
            if("runtime" != chunkId) {
                // 初始化 installedChunks[chunkId] = [resolve,reject,promise] 
                var promise = new Promise((resolve, reject) => (installedChunkData = installedChunks[chunkId] = [resolve, reject]));
                promises.push(installedChunkData[2] = promise);
                // 获取chunk的地址
                // 核心就是 当前逻辑就是 location + chunkId + '.chunk.js'
                var url = __webpack_require__.p + __webpack_require__.u(chunkId);

                // 定义 chunk 资源加载完成的回调函数
                // 处理 chunk 加载完成后，chunk的jsonp没有按预期执行的 错误处理
                var error = new Error();
                var loadingEnded = (event) => {
                  	if(__webpack_require__.o(installedChunks, chunkId)) {
                  		installedChunkData = installedChunks[chunkId];
                  		if(installedChunkData !== 0) installedChunks[chunkId] = undefined;
                  		if(installedChunkData) {
                  			var errorType = event && (event.type === 'load' ? 'missing' : event.type);
                  			var realSrc = event && event.target && event.target.src;
                  			error.message = 'Loading chunk ' + chunkId + ' failed.\n(' + errorType + ': ' + realSrc + ')';
                  			error.name = 'ChunkLoadError';
                  			error.type = errorType;
                  			error.request = realSrc;
                  			installedChunkData[1](error);
                  		}
                  	}
                };
                // __webpack_require__.l 的核心逻辑是 通过插入 script 标签来获取 script 脚本
                __webpack_require__.l(url, loadingEnded, "chunk-" + chunkId, chunkId);
            }else{
                // runtime 
                installedChunks[chunkId] = 0;
            }
        }
    }
}
```
所以回到`__webpack_require__.e`方法，这个返回通过`Promise.all`返回了一个`promise`，而`promise.all`的参数是一个动态插入`script`标签,并且在标签加载并执行完成后，再执行对应的`resolve`方法的。所以可以得到`main.js`中的`__webpack_require__.e`会在`sum.chunk.js`加载完成后在执行对应的`then`方法。
接着看下最后的一个文件
```js
// sum.chunk.js
(self['webpackJSONP'] = self['webpackJSONP'] || []).push([['sum'],{
     "./src/sum.js":(__unused_webpack_module, __webpack_exports__, __webpack_require__)=>{
        __webpack_require__.r(__webpack_exports__);
        __webpack_require__.d(__webpack_exports__, {
           "sum": () => (/* binding */ sum)
        });
        function sum(a,b){
            return a+b
        }
     }
})
```
`sum.chunk.js`在加载完成后同样会执行到`webpackJsonpCallback`方法，从而执行到以下方法
```js
(__unused_webpack_module, __webpack_exports__, __webpack_require__)=>{
     __webpack_require__.r(__webpack_exports__);
     __webpack_require__.d(__webpack_exports__, {
        "sum": () => (/* binding */ sum)
     });
     function sum(a,b){
        return a+b
    }
 }
```
看下关键的`r` `d`2个方法的定义
```js
__webpack_require__.r = (exports) => {
    // 修改 Symbol.toStringTag 实现 toString 方法的修改
	if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
	}
    // 定义 __esModule 属性
	Object.defineProperty(exports, '__esModule', { value: true });
};

__webpack_require__.d = (exports, definition) => {
	for(var key in definition) {
		if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
            // 将 definition 的属性 绑定到 exports 对象上
			Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
		}
	}
}
```
代码很简单，其实核心就是给 `__webpack_exports__` 对象绑定上`d`函数的第二个参数中的属性。回到`main.js`中来，
```js
 __webpack_require__
        .e(/*! import() | sum */ 'sum')
        .then(
          __webpack_require__.bind(
            __webpack_require__,
             './src/sum.js',
          ),
        )
        .then(({ sum }) => {
          console.log(sum(1, 2));
        });
```
当`e`方法执行完成，就会执行到`__webpack_require__`方法，这个方法会返回之前定义的`module.exports`属性，最后就完成了整个按需加载的流程

## 总结
- webpack的运行时在项目最开始被加载，除了初始化一些函数和变量外。全局定义了一个`jsonp`的变量数组，并且劫持了这个数据的`push`方法。在这个`push`方法内完成了`chunk`运行时的执行和`chunk`获取状态`promise`的确定
- chunk文件被包裹成成了一个全局`jsonp`数组`push`方法的函数，当加载完成了会触发执行，从而将该`chunk`添加到已安装的`chunk`数组内
- webpack实现了自己的`require`方法，当出现动态加载时，先实例一个`chunk`加载状态的`promise`,并通过`script`脚本去加载`chunk`,加载完成后，触发`chunk`的执行回调，将`chunk`内容添加到已安装的chunk数组内，并修改`promise`的状态。然后再通过`__webpack_require__`方法，动态的从已安装的模块中拿到对应的`chunk`内容