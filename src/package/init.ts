import { Module } from './modules/module'
import { vnode, VNode } from './vnode'
import * as is from './is'
import { htmlDomApi, DOMAPI } from './htmldomapi'

type NonUndefined<T> = T extends undefined ? never : T

function isUndef (s: any): boolean {
  return s === undefined
}
function isDef<A> (s: A): s is NonUndefined<A> {
  return s !== undefined
}

type VNodeQueue = VNode[]

const emptyNode = vnode('', {}, [], undefined, undefined)

function sameVnode (vnode1: VNode, vnode2: VNode): boolean {
  return vnode1.key === vnode2.key && vnode1.sel === vnode2.sel
}

function isVnode (vnode: any): vnode is VNode {
  return vnode.sel !== undefined
}

type KeyToIndexMap = {[key: string]: number}

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
}

type ModuleHooks = ArraysOf<Required<Module>>

function createKeyToOldIdx (children: VNode[], beginIdx: number, endIdx: number): KeyToIndexMap {
  const map: KeyToIndexMap = {}
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i]?.key
    if (key !== undefined) {
      map[key] = i
    }
  }
  return map
}

const hooks: Array<keyof Module> = ['create', 'update', 'remove', 'destroy', 'pre', 'post']

export function init(modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  /**
   * 第一部分：定义变量
   */
  let i: number  // 循环变量
  let j: number  // 循环变量
  const cbs: ModuleHooks = {  // 钩子回调list
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: []
  }

  /**
   * 第二部分：参数接收
   */
  // 节点操作api，默认环境为 浏览器
  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi
  // 模块的钩子函数 => 钩子回调
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      const hook = modules[j][hooks[i]]
      if (hook !== undefined) {
        (cbs[hooks[i]] as any[]).push(hook)
      }
    }
  }

  /**
   * 第三部分：函数声明
   */
  function emptyNodeAt(elm: Element) {
    /**
     * 一、变量接收ele的id和class
     */
    const id = elm.id ? '#' + elm.id : ''
    const c = elm.className ? '.' + elm.className.split(' ').join('.') : ''
    /**
     * 二、创建vnode
     */
    return vnode(api.tagName(elm).toLowerCase() + id + c, {}, [], undefined, elm)
  }

  function createRmCb (childElm: Node, listeners: number) {
    return function rmCb () {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm) as Node
        api.removeChild(parent, childElm)
      }
    }
  }

  /**
   * 根据虚拟节点，在虚拟节点内，生成对应的元素，返回该元素
   * @param vnode 虚拟节点
   * @param insertedVnodeQueue 插入钩子收集
   * @returns dom node节点
   */
  function createElm(vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    /**
     * 第一部分：定义变量，处理并接收参数
     */
    let i: any // 循环变量
    // 
    let data = vnode.data
    if (data !== undefined) {
      // 虚拟节点数据有值
      const init = data.hook?.init
      if (isDef(init)) {
        // 使用虚拟节点数据的钩子init处理一遍虚拟节点
        init(vnode)
        // 获取最新的虚拟节点数据
        data = vnode.data
      }
    }
    const children = vnode.children // 虚拟节点子节点
    const sel = vnode.sel // 虚拟节点 元素选择器

    /**
     * 第二部分：根据sel选择器创建不同类型的Node节点
     */
    if (sel === '!') {
      // 选择器为! => 创建一个注释Node节点
      if (isUndef(vnode.text)) {
        vnode.text = ''
      }
      vnode.elm = api.createComment(vnode.text!)
    } else if (sel !== undefined) {
      // 选择器有值时

      // 1.处理sel字符
      const hashIdx = sel.indexOf('#') // #字符索引
      const dotIdx = sel.indexOf('.', hashIdx) // .字符索引，注意是从#字符开始查找，所以#要写在前面
      const hash = hashIdx > 0 ? hashIdx : sel.length // 健壮性
      const dot = dotIdx > 0 ? dotIdx : sel.length // 健壮性
      const tag = hashIdx !== -1 || dotIdx !== -1 ? sel.slice(0, Math.min(hash, dot)) : sel // 标签tag


      // 2.生成元素，并添加id和class
      const elm = vnode.elm = isDef(data) && isDef(i = data.ns) // 根据虚拟节点数据中的ns（命名空间），选择生成 svg或普通元素节点
        ? api.createElementNS(i, tag)
        : api.createElement(tag)
      if (hash < dot) elm.setAttribute('id', sel.slice(hash + 1, dot))
      if (dotIdx > 0) elm.setAttribute('class', sel.slice(dot + 1).replace(/\./g, ' '))

      // 3.处理模块钩子
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode)

      // 4.处理子虚拟节点
      if (is.array(children)) {
        // 遍历child虚拟节点，生成对应的子元素，加入到 ele元素中
        for (i = 0; i < children.length; ++i) {
          const ch = children[i]
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue))
          }
        }
      } else if (is.primitive(vnode.text)) {
        // 无children 且 有文本text时，生成一个文本节点作为其子节点
        api.appendChild(elm, api.createTextNode(vnode.text))
      }

      // 5.处理开发者的钩子
      const hook = vnode.data!.hook
      if (isDef(hook)) {
        hook.create?.(emptyNode, vnode)
        if (hook.insert) {
          // 收集insert钩子
          insertedVnodeQueue.push(vnode)
        }
      }

    } else {
      // 处理sel没有值 => 创建一个文本节点，作为vnode的元素
      vnode.elm = api.createTextNode(vnode.text!)
    }

    return vnode.elm
  }

  function addVnodes (
    parentElm: Node,
    before: Node | null,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before)
      }
    }
  }

  function invokeDestroyHook (vnode: VNode) {
    const data = vnode.data
    if (data !== undefined) {
      data?.hook?.destroy?.(vnode)
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j]
          if (child != null && typeof child !== 'string') {
            invokeDestroyHook(child)
          }
        }
      }
    }
  }

  /**
   * 批量删除 元素的 虚拟节点对应的 子元素
   * @param parentElm 
   * @param vnodes 
   * @param startIdx 
   * @param endIdx 
   */
  function removeVnodes(
    parentElm: Node,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number): void {
    
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number
      let rm: () => void
      const ch = vnodes[startIdx]

      if (ch != null) {
        if (isDef(ch.sel)) {
          invokeDestroyHook(ch)

          // 避免重复删除元素，只有最后一次rm执行，才会真正的删除元素
          listeners = cbs.remove.length + 1
          rm = createRmCb(ch.elm!, listeners)
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm)
          const removeHook = ch?.data?.hook?.remove
          if (isDef(removeHook)) {
            removeHook(ch, rm)
          } else {
            rm()
          }
        } else {
          // 不带sel的虚拟节点，被认为是虚拟文本节点，虚拟文本节点就是一个只有text的虚拟节点，所以可以直接删除
          api.removeChild(parentElm, ch.elm!)
        }
      }
    }
  }

  function updateChildren (parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue) {
    /**
     * 一、变量
     */
    let oldStartIdx = 0 // 老开始索引
    let oldEndIdx = oldCh.length - 1 // 老结束索引
    let newStartIdx = 0 // 新开始索引
    let newEndIdx = newCh.length - 1 // 新结束索引

    let oldStartVnode = oldCh[0] // 老开始虚拟节点
    let newStartVnode = newCh[0] // 新开始虚拟节点
    let oldEndVnode = oldCh[oldEndIdx] // 老结束虚拟节点
    let newEndVnode = newCh[newEndIdx] // 新结束虚拟节点

    let oldKeyToIdx: KeyToIndexMap | undefined
    let idxInOld: number
    let elmToMove: VNode
    let before: any

    /**
     * 二、diff算法
     */
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) { // 循环的条件是 新老list有一个走完
      if (oldStartVnode == null) { // 注意不是 ”全等“，因为兜底时，会把项置空
        oldStartVnode = oldCh[++oldStartIdx] // Vnode might have been moved left
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx]
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) { // 老开始节点 same 新开始节点
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) { // 老结束节点 same 新结束节点
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // 老开始节点 same 新结束节点 => Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldStartVnode.elm!, api.nextSibling(oldEndVnode.elm!))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // 老结束节点 same 新开始节点 => Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        /**
         * 上述四个策略都不行 => 从新开始节点，遍历新节点
         */
        // 老节点的map key:idx
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        }
        // 当前新开始节点，找到老节点里 same向
        idxInOld = oldKeyToIdx[newStartVnode.key as string]

        if (isUndef(idxInOld)) {
          // 找不到，代表新节点是新元素，直接向左插入
          api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
        } else {
          // 找到了
          elmToMove = oldCh[idxInOld]
          if (elmToMove.sel !== newStartVnode.sel) {
            // 虽然key相同，但是sel不同，也认为是新元素，直接向左插入
            api.insertBefore(parentElm, createElm(newStartVnode, insertedVnodeQueue), oldStartVnode.elm!)
          } else {
            // same项
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined as any // 老节点list那一项置为 undefind
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!) // 向左插入
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }

    /**
     * 三、处理剩下的多余节点的情况
     */
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) { // 老节点遍历完，新节点没有遍历完
        // 判断插入位置
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm
        // 插入到新节点list最后一项之前
        addVnodes(parentElm, before, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
      } else { // 新节点遍历完，老节点没有遍历完
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx) // 移除多余老节点
      }
    }
  }

  /**
   * 在虚拟节点相同时，被调用，主要处理虚拟节点的子虚拟节点
   * @param oldVnode 
   * @param vnode 
   * @param insertedVnodeQueue 
   * @returns 
   */
  function patchVnode(oldVnode: VNode, vnode: VNode, insertedVnodeQueue: VNodeQueue) {
    /**
     * 一、变量与前置工作
     */
    const hook = vnode.data?.hook // 新虚拟节点hook属性
    hook?.prepatch?.(oldVnode, vnode) // prepatch钩子触发

    const elm = vnode.elm = oldVnode.elm! // 因为是相同节点，复用老虚拟节点的节点
    const oldCh = oldVnode.children as VNode[] // 老虚拟节点子节点
    const ch = vnode.children as VNode[] // 新虚拟节点子节点
    if (oldVnode === vnode) return // 虚拟节点完全相同，则不需要比较

    // 触发 模块钩子update，开发钩子update
    if (vnode.data !== undefined) {
      for (let i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      vnode.data.hook?.update?.(oldVnode, vnode)
    }

    /**
     * 二、虚拟节点，子节点比较的核心部分
     */
    if (isUndef(vnode.text)) { // 新虚拟节点text为空，可能children有值
      /**
       * 根据老children和新children的各种值，做出逻辑判断
       */
      if (isDef(oldCh) && isDef(ch)) { // 新、老children都有值
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue) // 核心中的核心：比较两个子虚拟节点
      } else if (isDef(ch)) { // 只有新children有值
        if (isDef(oldVnode.text)) api.setTextContent(elm, '') // 清空 老虚拟节点text值
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue) // 在老节点上直接加上新的子节点
      } else if (isDef(oldCh)) { // 只有老children有值
        removeVnodes(elm, oldCh, 0, oldCh.length - 1) // 老节点移除所有子节点
      } else if (isDef(oldVnode.text)) { // 新老children都没有值
        api.setTextContent(elm, '') // 在老节点上设置空文本
      }
    } else if (oldVnode.text !== vnode.text) { // 新虚拟节点text有值，且!==老虚拟节点text
      if (isDef(oldCh)) { // 移除老children
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      }
      api.setTextContent(elm, vnode.text!) // 在老节点上设置文本
    }

    /**
     * 三、收尾
     */
    // 触发 开发者钩子postpatch
    hook?.postpatch?.(oldVnode, vnode)
  }

  /**
   * 第四部分：返回patch函数
   */
  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    /**
     * 一、定义变量
     */
    let i: number, elm: Node, parent: Node
    const insertedVnodeQueue: VNodeQueue = []

    /**
     * 二、模块钩子pre
     */
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]()

    /**
     * 三、处理 oldVnode不是vnode类型=>转为vnode
     */
    if (!isVnode(oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode)
    }

    /**
     * 四、核心-节点对比
     */
    if (sameVnode(oldVnode, vnode)) {
      // 虚拟节点相同，比较节点内部
      patchVnode(oldVnode, vnode, insertedVnodeQueue)
    } else {
      // 处理 虚拟节点不同的场景
      elm = oldVnode.elm!
      parent = api.parentNode(elm) as Node

      // 虚拟节点创建节点
      createElm(vnode, insertedVnodeQueue)
      // 将节点插入dom，并移除原节点
      if (parent !== null) {
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm))
        removeVnodes(parent, [oldVnode], 0, 0)
      }
    }

    /**
     * 五、执行所有收集的insert钩子
     */
    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i])
    }

    /**
     * 六、执行模块钩子post
     */
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]()

    /**
     * 七、返回传入的新节点
     */
    return vnode
  }
}
