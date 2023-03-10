# 按需加载

## webpack插件分析

直接看`webpack-transform-modules-plugin`的代码，核心代码如下

```js
function runGetter(compiler, callback) {
  var transformModules = that._collectTransformModules(compiler);
  if (Object.keys(transformModules).length) {
    var rules = compiler.options.module.rules;
    rules && rules.forEach(iterRule);
  }
  callback();

  function interRule() {}
  function doRule() {}
  function updateLoaderConf() {}
  function updateRule() {}
  function updateVueLoaderOptions() {}
}

compiler.hooks.beforeRun.tapAsync('TransformModulesPlugin', runGetter);
compiler.hooks.watchRun.tapAsync('TransformModulesPlugin', runGetter);
```

`_collectTransformModules`方法的核心是获取`transformModules`的配置，通过查找查找项目的`package.json`配置，找到对应的`transformModules`配置并添加后返回，再递归的查找项目的`dependencies`的配置，找出所有的`transformModules`配置后并返回。

接着获取到当前`webpack`的所有`module.rules`配置，并循环执行`interRule`方法

```js
function iterRule(rule, i) {
  if (doRule(rule, 'loader')) {
  } else if (doRule(rule, 'use')) {
  } else if (rule.oneOf) {
    if (!Array.isArray(rule.oneOf)) {
      rule.oneOf = [rule.oneOf];
    }
    rule.oneOf.forEach(iterRule);
  }
}
function doRule(rule, key) {
  var conf = rule[key];
  if (conf) {
    if (Array.isArray(conf)) {
      conf.forEach(function (loaderConf, i) {
        if (typeof loaderConf === 'string') {
          loaderConf = conf[i] = {
            loader: loaderConf,
          };
        }
        updateLoaderConf(loaderConf);
      });
    } else {
      if (key === 'use') {
        if (typeof conf === 'string') {
          conf = rule.use = {
            loader: conf,
          };
        }
        updateLoaderConf(conf);
      } else {
        updateLoaderConf(rule);
      }
    }
    return true;
  }
  return false;
}
function updateLoaderConf(rule) {
  if (util.loaderNameMatches(rule, 'babel-loader')) {
    updateRule(rule);
  } else if (util.loaderNameMatches(rule, 'vue-loader')) {
    updateVueLoaderOptions(rule);
  }
}
```

因为`loader`的有多种配置方法，`iterRule`就是根据不同的配置方式调用`doRule`这个方法。`doRule`方法核心是调用`updateLoaderConf`方法，根据配置的不同处理不同的入参.`updateLoaderConf`这个方法，根据`rule`来判断是`vue-loader`还是`babel-loader`来调用不同的处理方法

```js
function updateRule(conf) {
  if (!conf.options) {
    conf.options = {};
  }
  if (!conf.options.plugins) {
    conf.options.plugins = [];
  }
  if (!Array.isArray(conf.options.plugins)) {
    conf.options.plugins = [conf.options.plugins];
  }
  var name = 'babel-plugin-transform-modules';
  var plugins = conf.options.plugins;
  var added = plugins.some(function (plugin) {
    return plugin === name || plugin[0] === name;
  });
  !added && plugins.push([name, transformModules]);
}
function updateVueLoaderOptions(conf) {
  if (!conf.options) {
    conf.options = {};
  }
  if (!conf.options.loaders) {
    conf.options.loaders = {};
  }
  var jsConf = conf.options.loaders.js;
  if (!jsConf) {
    jsConf = conf.options.loaders.js = [];
  } else if (typeof jsConf === 'string') {
    if (jsConf === 'babel-loader') {
      // reset
      jsConf = conf.options.loaders.js = [];
    } else {
      jsConf = conf.options.loaders.js = [
        {
          loader: jsConf,
        },
      ];
    }
  }
  if (typeof jsConf === 'object' && jsConf.loader === 'babel-loader') {
    jsConf.plugins = jsConf.plugins || [];
    jsConf.plugins.push(['babel-plugin-transform-modules', transformModules]);
  } else {
    jsConf.push({
      loader: 'babel-loader',
      options: {
        plugins: [['babel-plugin-transform-modules', transformModules]],
      },
    });
  }
}
```

`updateRule`方法用来处理`babel-loader`核心就是给`babel-loader`的参数添加上`babel-plugin-transform-modules`这个 plugin。类型如下

```js
//处理前
{ loader:'babel-loader' }
//处理后
{
    loader:'babel-loader',
    options:{
        plugins:[['babel-plugin-transform-modules',{ /* transformModule */ }]]
    }
}
```

`updateVueLoaderOptions`方法用来处理`vue-loader`的参数，主要是添加`babel-loader`配置

```js
//处理前
{ loader:'vue-loader' }
//处理后
{
    loader:'vue-loader',
    options:{
        loaders:{
            js:[
                {
                    loader:'babel-loader',
                    options:{
                        plugins:[ 'babel-plugin-transform-modules',{ /* transformModule */ } ]
                    }
                }
            ]
        }
    }
}
```

所以，`webpack-transform-modules-plugin`核心就是给`webpack`的`babel-loader` `vue-loader`添加额外的参数。其实这部分我们在自己项目的`webpack`中就可以添加，唯一实现的增强就是递归去查找所有依赖中的`transformModule`配置

## babel插件分析

`babel-plugin-transform-modules`是一个`babel`插件，核心是处理`import`语句的。以一个例子来说明

```js
// 假设上面的transformModule配置如下
var transformModules = {
  'element-ui': {
    kebabCase: true,
    transform: 'element-ui/src/components/${member}',
  },
};
// 导入方式如下
import ElementUI, { Message } from 'element-ui';
```

上面的代码，带入到`babel-plugin-transform-modules`这个插件的源码中进行理解

```js
module.exports = function (babel) {
  var types = babel.types;
  return {
    visitor: {
      ImportDeclaration: function (path, state) {
        var source = path.node.source.value; //导入的源 例子中的 ‘element-ui’
        // state.opts plugin的参数 就是 transformModules 这个对象
        // 这段是处理相对路径的导入 不作分析
        if (!(source in state.opts) && source.match(/^\.{0,2}\//)) {
          source = pathLib.resolve(
            pathLib.join(
              source[0] === '/'
                ? ''
                : pathLib.dirname(state.file.opts.filename),
              source,
            ),
          );
        }
        if (source in state.opts) {
          var opts = state.opts[source];

          var transforms = [];
          var styleTransforms = [];

          // 全量导入的节点 例子中的 ElementUI
          var fullImports = path.node.specifiers.filter(function (specifier) {
            return specifier.type !== 'ImportSpecifier';
          });
          // 成员导入的节点 例子中的 Message
          var memberImports = path.node.specifiers.filter(function (specifier) {
            return specifier.type === 'ImportSpecifier';
          });

          if (fullImports.length > 0) {
            if (memberImports.length > 0) {
              // 如果一个导入语句中既有全局导入也有成员导入 那么往 transform 中插入一条全量导入
              // Exp: import ElementUI from 'element-ui'
              transforms.push(
                types.importDeclaration(
                  fullImports,
                  types.stringLiteral(source),
                ),
              );
            }
            // 处理样式导入
            handleStyleImport(opts, styleTransforms, types);
          }
          var hasFullStyleImports = styleTransforms.length > 0;
          memberImports.forEach(function () {
            // 根据配置处理name
            var importName = memberImport.imported.name;
            if (opts.camelCase) importName = camel(importName);
            if (opts.kebabCase) importName = kebab(importName);
            if (opts.snakeCase) importName = snake(importName);

            // 生成替换节点source字符串
            // 'element-ui/src/components/message'
            var replace = transform(opts.transform, importName);

            // 是否保存默认语法
            // 不保存则转成 default语法 import message
            var newImportSpecifier = opts.skipDefaultConversion
              ? memberImport
              : types.importDefaultSpecifier(
                  types.identifier(memberImport.local.name),
                );

            // 最后生成完整的导入语句节点
            // import message from 'element-ui/src/components/message'
            transforms.push(
              types.importDeclaration(
                [newImportSpecifier],
                types.stringLiteral(replace),
              ),
            );

            // 判断是否有全量导入样式的节点
            // 如果没有则处理成员的样式节点
            !hasFullStyleImports &&
              handleStyleImport(opts, styleTransforms, types, importName);
          });

          // 最后替换或插入语句，本例中最后的语句为
          // import ElementUI from 'element-ui'
          // import message from 'element-ui/src/components/message'
          if (transforms.length > 0) {
            path.replaceWithMultiple(transforms.concat(styleTransforms));
          } else if (styleTransforms.length) {
            path.insertAfter(styleTransforms);
          }
        }
      },
    },
  };
};
```

可见得，`babel-plugin-transform-modules`这个插件主要就是对`import`的语句做了处理，再看下`handleStyleImport`的处理

```js
function handleStyleImport(opts, styleTransforms, types, importName) {
  if (opts.style) {
    // parseStyleOption 返回 { name:'styleName',ignore:[] } 这样标准格式的对象
    var styleOption = parseStyleOption(opts.style);
    var styleName = styleOption.name;
    var ignore = styleOption.ignore;
    var hasImportName = !!importName;
    if (!importName) {
      importName = styleName;
    }
    if (ignore.indexOf(importName) >= 0) {
      return;
    }
    // 这里返回的结果与是否是全量导入有关
    // 全量导入 ‘element-ui/src/components/style.css’
    // 成员导入 ‘element-ui/src/components/input/style.css’
    var replace = transform(
      opts.transform,
      importName,
      styleName,
      hasImportName,
    );
    // 非标记符的导入方式 exp: import ‘element-ui/src/components/style.css’
    styleTransforms.push(
      types.importDeclaration([], types.stringLiteral(replace)),
    );
  }
}
```
## 总结
- `webpack-transform-modules-plugin`作为一个`webpack`插件，主要作用是动态的修改`module.rules`里面的`loader`配置，给`babel-loader`加上`babel-plugin-transform-modules`这个插件，给`vue-loader`的`options.loader.js`添加`babel-loader`。且会递归的的查看依赖的`package.json`找到`transformModules`配置，作为插件的参数
- `babel-plugin-transform-modules`插件作为一个`babel`插件，主要是分析`import`语句。再根据传入的参数修改添加新的`import`语句，实现开发过程中简化导入语法的目的