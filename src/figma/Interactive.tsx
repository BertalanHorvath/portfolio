import {
  createElement, useEffect, useRef, type AnchorHTMLAttributes, type FocusEvent, type HTMLAttributes,
  type MouseEvent,
} from 'react';
import { NodeContent, nodeOuterStyle } from './Node';
import { scene } from './scene';
import type { FNode, Interaction } from './types';
import { useAnimatedTree } from './useAnimatedTree';

/** A variant rendered in place of an instance keeps the instance's placement. */
export function variantAt(base: FNode, variantId: string): FNode {
  const v = scene.variants[variantId];
  if (!v) return base;
  return { ...v, i: base.i, m: base.m, ix: v.ix };
}

const find = (n: FNode | undefined, on: string) => n?.ix?.find((x) => x.on === on);

export interface InteractiveProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  node: FNode;
  as?: 'a' | 'button' | 'div' | 'article' | 'span';
  href?: string;
  target?: AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: string;
  /** Click handler; receives the Figma click interaction (if any) of the state on screen. */
  onActivate?: (ix: Interaction | undefined, e: MouseEvent) => void;
  /** Keyboard focus plays the hover state (cards have no other keyboard affordance). */
  focusHover?: boolean;
}

/**
 * Prototype runtime for one interactive layer: ON_HOVER (swap while hovered, swap back on
 * leave), MOUSE_ENTER / MOUSE_LEAVE chains and ON_CLICK, each with its Figma transition.
 */
export function Interactive({ node, as = 'div', onActivate, focusHover, href, target, rel, className, style, ...rest }: InteractiveProps) {
  const { tree, set, animateTo } = useAnimatedTree(node);
  const state = useRef<{ variant: string | null; hover: Interaction | null }>({ variant: null, hover: null });

  // The base layer itself can change (e.g. while its screen animates); follow it when idle.
  useEffect(() => {
    if (!state.current.variant) set(node);
  }, [node, set]);

  const current = () => (state.current.variant ? scene.variants[state.current.variant] : node);

  const go = (ix: Interaction | undefined) => {
    if (!ix || ix.do !== 'CHANGE_TO') return false;
    if (!ix.to) {
      // CHANGE_TO without a destination (e.g. the active BettAir tag's mouse-leave): no visual change.
      return false;
    }
    state.current.variant = ix.to;
    animateTo(variantAt(node, ix.to), ix.tr);
    return true;
  };

  const enter = () => {
    const cur = current();
    const hover = find(cur, 'ON_HOVER');
    if (hover && !state.current.hover) {
      state.current.hover = hover;
      go(hover);
      return;
    }
    go(find(cur, 'MOUSE_ENTER'));
  };
  const leave = () => {
    const hover = state.current.hover;
    if (hover) {
      state.current.hover = null;
      state.current.variant = null;
      animateTo(node, hover.tr);
      return;
    }
    go(find(current(), 'MOUSE_LEAVE'));
  };

  const onClick = (e: MouseEvent) => {
    const ix = find(current(), 'ON_CLICK') ?? find(node, 'ON_CLICK');
    onActivate?.(ix, e);
  };

  const outer = nodeOuterStyle(tree);
  return createElement(
    as,
    {
      ...rest,
      href, target, rel,
      className: ['fx-interactive', className].filter(Boolean).join(' '),
      style: { ...outer, ...style },
      'data-node': node.n,
      onMouseEnter: enter,
      onMouseLeave: leave,
      onFocus: focusHover ? (e: FocusEvent<HTMLElement>) => { if (e.target.matches(':focus-visible')) enter(); } : undefined,
      onBlur: focusHover ? () => leave() : undefined,
      onClick: onActivate ? onClick : undefined,
    },
    <NodeContent n={tree} />,
  );
}
