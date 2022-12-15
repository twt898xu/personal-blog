# v-if 的浅析

与`v-show`不同，`v-if`并非在 vue 的运行时作用，而是在编译阶段进行了处理。下面是对这块实现的学习和总结

## 解析阶段

在 vue2 中，当调用 html 解析器 parseHtml 时有相关伪代码如下，对应源码位置是`src/complier/parser/index.js`

```javascript
export function parse(template) {
  // stack 当前节点ast的栈
  const stack = [];
  //...
  parseHtml(template, {
    // 表示处理标签开始节点 如 <div
    start(tag, attrs, unary, start, end) {
      //...
      // element 表示当前 标签开始节点的 ast
      let element: ASTElement = createASTElement(tag, attrs, currentParent);
      //...
      processIf(element);
      //...
      if (unary) {
        closeElement(element);
      }
    },
    end() {
      const element = stack[stack.length - 1];
      closeElement(element);
    },
  });
  //...
}

function processIf(el) {
  //获取v-if属性并将该属性从ast中移除
  const exp = getAndRemoveAttr(el, 'v-if');
  if (exp) {
    el.if = exp;
    addIfCondition(el, {
      exp: exp,
      block: el,
    });
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true;
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if');
    if (elseif) {
      el.elseif = elseif;
    }
  }
}
```

我们先看`processIf`的调用，从上面的代码我们可以看出，html 解析器在处理标签开始节点的时候，会同时生成标签开始节点的 ast,并调用`processIf`进行 ast 的 2 次处理。
`processIf`的主要作用就是依次判断该 ast 是否含有` v-if` `v-else` `v-else-if `这 3 个指令，同时对 ast 进行编辑修饰。
这里有个比较重要的逻辑是，调用了`addIfCondition`这个方法。这个方法比较简单，就是对 ast 的`ifConditions`属性进行编辑和修饰，将`v-if`可能的`block`添加到`ifConditions`这个属性中：

```javascript
export function addIfCondition(el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = [];
  }
  el.ifConditions.push(condition);
}
```

我们再回头看`parseHtml`中`closeElement`的调用逻辑。这个方法会存在 2 种调用情况

- 解析标签开始节点，且这个标签是自闭合标签
- 解析标签结束节点

我们看下这个方法的实现

```javascript
function closeElement() {
  // 说明当前节点是一个和根节点同级别的节点
  if (!stack.length && element !== root) {
    //判断根节点是否有if 当前节点是否有 else elseif
    if (root.if && (element.elseif || element.else)) {
      addIfCondition(root, {
        exp: element.elseif,
        block: element,
      });
    }else{
        //error
    }
  }
  if (currentParent && !element.forbidden) {
    // 当前节点存在 elseif else
    if (element.elseif || element.else) {
      processIfConditions(element, currentParent);
    } else {
      currentParent.children.push(element);
      element.parent = currentParent;
    }
  }
}
```
上面对`closeElement`中对涉及`v-if`相关逻辑的一个提炼。可以看到，首先判断了当前处理的节点是否是一个和根节点同级别的节点。由于vue2中只允许存在一个根节点，所以必须要满足多个根节点的情况下只能渲染一个的条件。如果不满足条件则直接抛出错误。否则调用`addIfCondition`将当前节点作为`block`挂入到根节点的`ifConditions`属性下面。这里要注意哦，是根节点的`ifConditions`下面，这个很重要。

接着继续判断如果当前节点有`else`or`elseif`则调用`processIfConditions`进行处理，同时传入当前父节点作为参数。注意是 `当前父节点` 不是 `当前节点的父节点`,其实看下面的条件就知道，`else` and `elseif`是不会作为子节点插入到ast树中的。

我们接着看`processIfConditions`的实现
```javascript
function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else {
    //error
  }
}
```
这里首先调用了`findPrevElement`获取到了当前节点的上一个节点，这个方法就是获取到`parent.children`的最后一个标签类型的节点，作为当前节点上一个节点`prev`。然后判断`prev`是否满足`if`条件，满足的话就将当前节点作为`block`添加到`prev`节点的`ifConditions`属性中，否则就抛出错误。现在是否理解为什么`v-else` `v-else-if`必须要接在`v-if`的标签后面了嘛！

其实在编译阶段最主要的就是，在处理标签开始节点时给`v-if`的元素打上标签，并将该元素添加到自身的`ifConditions`属性中。然后在处理标签结束节点时将`v-else` `v-else-if`的元素，添加到对应的`v-if`元素的`ifConditions`属性中。

## Code生成阶段
说完了编译阶段，我们来看下`codegen`过程中发生了什么。源码对应的位置是`src/compiler/codegen/index.js`
`codegen`的核心函数`genElement`大概如下
```javascript
function genElement(el,state){
    if(/**/){
        //...
    }else if(/**/){
        //...
    }else if(el.if && !el.ifProcessed){
        return genIf(el, state)
    }else{
        ///
    }
}
```
可以看到，`genElement`中一堆判断条件，其中有一条专门为`v-if`指令提供的，来看看`genIf`做了些什么
```javascript
function genIf (el,state) {
  el.ifProcessed = true // 打上标记
  return genIfConditions(el.ifConditions.slice(), state)
}
```
`genIf`的核心就是给当前ast加上一个`ifProcessed`的标记，防止被重复处理。然后调用`genIfConditions`方法,并传入当前节点的`ifConditions`的复制。
我们再看下`genIfConditions`的代码

```javascript
function genIfConditions (conditions,state){
  if (!conditions.length) {
    return '_e()' //空vnode
  }

  const condition = conditions.shift()
  if (condition.exp) {
    return `(${condition.exp})?${
      //本质是调用genElement
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state)
    }`
  } else {
    //本质是调用genElement
    return `${genTernaryExp(condition.block)}`
  }
}
```
首先判断了`conditions`是否为空，为空的话就返回一个空vnode的函数调用字符串。然后取出`conditions`数组中第一个元素`condition`。第一次调用这个方法时这个`condition`对应的`v-if`作用的元素。这里可以仔细思考下一下。
然后判断`exp`是否存在，这个其实就是`v-if` `v-else-if`对应的条件。如果条件存在，则返回一个3元表达式字符串，且调用了`genElement`生成一个函数字符串和递归调用`genIfConditions`方法，继续传入`conditions`。如果条件不存在(v-else对应的情况)则直接调用`genElement`返回一个函数字符串。
其实到这里`v-if`的逻辑就分析完了，`v-if`在经过编译后本质就是根据我们写的条件生成了一个符合条件的3元表达式而已。这样是不是就理解了为什么说`v-if`条件值为假，元素是不会渲染的了呢！

## 总结
- 在html解析阶段，在解析标签开始节点时处理节点的`v-if`绑定，给ast添加标记，将节点push到自身的`ifConditions`属性中
- 在html解析阶段，在解析标签结束节点时，处理节点的`v-else` `v-else-if`绑定，给ast添加标记，将节点push到对应的`v-if`节点的`ifConditions`属性中
- 在代码生成阶段，判断ast是否有`v-if`标记，然后递归的生成`ifConditions`中`block`对应的函数字符串，然后返回一个符合预期的3元表达式