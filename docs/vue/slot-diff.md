# 新旧Slot语法差异
Vue2.6.X版本中引入了`v-slot`语法，分析一下`slot`新旧语法间的差异。`v-slot`
## 编译阶段
### parserHtml 阶段
在html解析阶段的`closeElement`方法中会调用`processElement`方法来处理节点的`ast`，其中会调用`processSlotContent`方法来处理`ast`中的`slot`相关属性
```js
function processSlotContent (el) {

    let slotScope
    if(el.tag === 'template'){
        slotScope = getAndRemoveAttr(el, 'scope') // 兼容旧语法
        el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    }else if((slotScope = getAndRemoveAttr(el, 'slot-scope'))){
        el.slotScope = slotScope
    }

    const slotTarget = getBindingAttr(el, 'slot')
    if (slotTarget) {
        el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
        el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
        if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot')) // 作用未知
    }
    }

    if (process.env.NEW_SLOT_SYNTAX){
        if (el.tag === 'template') {
            const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
            if (slotBinding) {
                const { name, dynamic } = getSlotName(slotBinding)
                el.slotTarget = name
                el.slotTargetDynamic = dynamic
                el.slotScope = slotBinding.value || emptySlotScopeToken // emptySlotScopeToken '_empty_'
            }
        }else{
            // v-slot 只有一种情况不作用在 template 上
            // 即当前slot为default 且当前元素为自定义组件
            const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
            if (slotBinding) {
                const slots = el.scopedSlots || (el.scopedSlots = {})
                const { name, dynamic } = getSlotName(slotBinding)
                const slotContainer = slots[name] = createASTElement('template', [], el)
                slotContainer.slotTarget = name
                slotContainer.slotTargetDynamic = dynamic
                slotContainer.children = el.children.filter((c: any) => {
                    if (!c.slotScope) {
                        c.parent = slotContainer
                        return true
                    }
                })
                slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
                el.children = []
                el.plain = false
            }
        }
    }
}
```
仔细观察上面的代码可以得知，这段代码在处理旧的`slot` `slot-scope`语法时，只是分析属性绑定，给当前节点的`ast`添加了3个属性分别是
- slotTarget slot的name
- slotTargetDynamic  是否是动态的slot
- slotScope slotScope 的变量名称

在处理`v-slot`语法时，作用在template上的情况与上面一致。差异点在于处理`v-slot`作用在自定义组件上时，会在当前的节点`ast`上添加`slotScopes`对象，同时将提取出来的`slot`配置生成一个`template`的ast节点添加到这个对象中。同时将该节点下所有没有`slotScop`的节点添加到`child`属性中去，再去清空当前节点本身的子节点。


接着回到`processElement`的原始调用方法`CloseElement`方法中去
```js
function CloseElement(element){
    if (currentParent && !element.forbidden) {
        if (element.elseif || element.else) {
            processIfConditions(element, currentParent)
        }else{
            if (element.slotScope) {
              const name = element.slotTarget || '"default"'
              ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
            }
            currentParent.children.push(element)
            element.parent = currentParent
        }
    }
    element.children = element.children.filter(c => !(c: any).slotScope)
}
```