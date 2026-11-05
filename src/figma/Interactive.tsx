import {
  createElement, useEffect, useRef, type AnchorHTMLAttributes, type FocusEvent, type HTMLAttributes,
  type MouseEvent,
} from 'react';
import { NodeContent, nodeOuterStyle } from './Node';
import { scene } from './scene';
import type { FNode, Interaction } from './types';
import { useAnimatedTree } from './useAnimatedTree';
import { navigate, routeOfScreen, href as routeHref } from '../app/routes';
import { scrollToY, usePage } from '../app/scroll';

/** A variant rendered in place of an instance keeps the instance's placement. */
export function variantAt(base: FNode, variantId: string): FNode {
  const v = scene.variants[variantId];
  if (!v) return base;
  return { ...v, i: base.i, m: base.m, ix: v.ix };
}

const find = (n: FNode | undefined, on: string) => n?.ix?.find((x) => x.on === on);

/** The click action of a layer, also looking at its hover state (Figma often puts it there). */
export function clickAction(n: FNode): Interaction | undefined {
  const own = find(n, 'ON_CLICK');
  if (own) return own;
  const hover = find(n, 'ON_HOVER');
  return hover?.to ? find(scene.variants[hover.to], 'ON_CLICK') : undefined;
}

/** Element and link target that match a layer's click action. */
export function elementFor(n: FNode): { as: InteractiveProps['as']; href?: string; target?: string; rel?: string } {
  const ix = clickAction(n);
  if (ix?.do === 'NAVIGATE') {
    const route = routeOfScreen(ix.to);
    if (route !== undefined) return { as: 'a', href: routeHref(route) };
  }
  if (ix?.do === 'URL' && ix.url) {
    const external = /^https?:/.test(ix.url);
    return { as: 'a', href: ix.url, ...(external ? { target: '_blank', rel: 'noopener' } : {}) };
  }
  if (ix?.do === 'SCROLL_TO') return { as: 'button' };
  return { as: 'div' };
}

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
export function Interactive({ node, as: asProp, onActivate, focusHover, href: hrefProp, target: targetProp, rel: relProp, className, style, ...rest }: InteractiveProps) {
  const { tree, set, animateTo } = useAnimatedTree(node);
  const state = useRef<{ variant: string | null; hover: Interaction | null }>({ variant: null, hover: null });
  const page = usePage();
  const auto = asProp ? null : elementFor(node);
  const as = asProp ?? auto!.as ?? 'div';
  const href = hrefProp ?? auto?.href;
  const target = targetProp ?? auto?.target;
  const rel = relProp ?? auto?.rel;
  const timer = useRef(0);

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

  // AFTER_TIMEOUT → CHANGE_TO chains on a component (e.g. the home heading's word animation):
  // each state starts its own timer once the transition into it has finished.
  const schedule = (after = 0) => {
    window.clearTimeout(timer.current);
    const t = find(current(), 'AFTER_TIMEOUT');
    if (!t || t.do !== 'CHANGE_TO' || !t.to) return;
    timer.current = window.setTimeout(() => {
      go(t);
      schedule(t.tr?.dur ?? 0);
    }, (after + (t.delay ?? 0)) * 1000);
  };
  useEffect(() => {
    schedule();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const ix = find(current(), 'ON_CLICK') ?? clickAction(node);
    if (onActivate) return onActivate(ix, e);
    if (!ix) return;
    if (ix.do === 'NAVIGATE') {
      const route = routeOfScreen(ix.to);
      if (route === undefined) return;
      e.preventDefault();
      navigate(route, ix.tr);
    } else if (ix.do === 'SCROLL_TO' && ix.to && scene.anchors[ix.to] != null) {
      e.preventDefault();
      scrollToY(scene.anchors[ix.to] * page.scale, ix.tr);
    }
  };

  const outer = nodeOuterStyle(tree);
  return createElement(
    as,
    {
      ...rest,
      href, target, rel,
      type: as === 'button' ? 'button' : undefined,
      className: ['fx-interactive', as === 'a' || as === 'button' ? 'fx-focus fx-reset' : '', className].filter(Boolean).join(' '),
      style: { ...outer, ...style },
      'data-node': node.n,
      onMouseEnter: enter,
      onMouseLeave: leave,
      onFocus: focusHover ? (e: FocusEvent<HTMLElement>) => { if (e.target.matches(':focus-visible')) enter(); } : undefined,
      onBlur: focusHover ? () => leave() : undefined,
      onClick,
    },
    <NodeContent n={tree} />,
  );
}
