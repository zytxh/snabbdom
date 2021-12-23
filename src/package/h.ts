import { vnode, VNode, VNodeData } from './vnode'
import * as is from './is'

export type VNodes = VNode[]
export type VNodeChildElement = VNode | string | number | undefined | null
export type ArrayOrElement<T> = T | T[]
export type VNodeChildren = ArrayOrElement<VNodeChildElement>

function addNS (data: any, children: VNodes | undefined, sel: string | undefined): void {
  data.ns = 'http://www.w3.org/2000/svg'
  if (sel !== 'foreignObject' && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      const childData = children[i].data
      if (childData !== undefined) {
        addNS(childData, (children[i] as VNode).children as VNodes, children[i].sel)
      }
    }
  }
}

export function h (sel: string): VNode
export function h (sel: string, data: VNodeData | null): VNode
export function h (sel: string, children: VNodeChildren): VNode
export function h (sel: string, data: VNodeData | null, children: VNodeChildren): VNode
export function h(sel: any, b?: any, c?: any): VNode {
  /**
   * 第一部分：定义变量
   */
  var data: VNodeData = {}
  var children: any
  var text: any
  var i: number

  /**
   * 第二部分：处理参数
   */
  // 处理参数类型与个数不同时，对参数的接受
  if (c !== undefined) {
    // 参数个数 === 3

    if (b !== null) { // 对参数b的处理
      // b非null => 虚拟节点数据 取 b
      data = b
    }

    if (is.array(c)) {
      // c为数组 => children 取 c
      children = c
    } else if (is.primitive(c)) {
      // c为普通类型 => 文本 取 c
      text = c
    } else if (c && c.sel) {
      // c为有sel属性的对象 => children 取 [c]
      children = [c]
    }
  } else if (b !== undefined && b !== null) {
    // 参数个数 === 2

    if (is.array(b)) {
      // b为数组 => children 取 b
      children = b
    } else if (is.primitive(b)) {
      // b为普通类型 => 文本 取 b
      text = b
    } else if (b && b.sel) {
      // b为有sel属性的对象 => children 取 [b]
      children = [b]
    } else {
      // b为普通对象 => data 取 b
      data = b
    }
  }

  /**
   * 第三部分：特殊数据处理
   */
  if (children !== undefined) {
    // 遍历children，确保每个child为vnode
    for (i = 0; i < children.length; ++i) {
      if (is.primitive(children[i])) children[i] = vnode(undefined, undefined, undefined, children[i], undefined)
    }
  }

  /**
   * 第四部分：svg元素
   */
  if (
    sel[0] === 's' && sel[1] === 'v' && sel[2] === 'g' &&
    (sel.length === 3 || sel[3] === '.' || sel[3] === '#')
  ) {
    addNS(data, children, sel)
  }

  /**
   * 第五部分：返回 vnode 虚拟节点
   */
  return vnode(sel, data, children, text, undefined)
};
