import {useLocation} from 'wouter';
import {forwardRef, type AnchorHTMLAttributes} from 'react';

export function usePathname() {
  return useLocation()[0].split('?')[0];
}

export function useRouter() {
  const [, navigate] = useLocation();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, {replace: true}),
    back: () => window.history.back(),
    refresh: () => window.location.reload(),
  };
}

const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function Link({href = '', onClick, children, ...props}, ref) {
    const [, navigate] = useLocation();
    return <a {...props} ref={ref} href={href} onClick={event => {
      onClick?.(event);
      if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey &&
          !event.metaKey && !event.shiftKey && !event.altKey &&
          (!props.target || props.target === '_self') && href.startsWith('/')) {
        event.preventDefault();
        navigate(href);
      }
    }}>{children}</a>;
  },
);
export default Link;
