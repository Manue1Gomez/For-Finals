import { useLayoutEffect } from 'react';

export default function PageStyles({ bodyClass, title }) {
  useLayoutEffect(() => {
    const previousBodyClass = document.body.className;
    const previousTitle = document.title;
    document.body.className = bodyClass;
    document.title = title;

    return () => {
      document.body.className = previousBodyClass;
      document.title = previousTitle;
    };
  }, [bodyClass, title]);

  return null;
}
