'use client';

import { useEffect } from 'react';
import { argsLookLikeExtensionNoise, isExtensionNoise } from './extensionNoisePatterns';

const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug'] as const;
const originalConsoleMethods = new Map<(typeof CONSOLE_METHODS)[number], typeof console.log>();

function patchConsole() {
  CONSOLE_METHODS.forEach((method) => {
    if (!originalConsoleMethods.has(method)) {
      originalConsoleMethods.set(method, console[method].bind(console));
    }

    console[method] = (...args: unknown[]) => {
      if (argsLookLikeExtensionNoise(args)) return;
      originalConsoleMethods.get(method)?.(...args);
    };
  });
}

function patchPromiseRejections() {
  const previousOnUnhandledRejection = window.onunhandledrejection;
  const previousOnError = window.onerror;

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isExtensionNoise(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  };

  const onWindowError = (event: ErrorEvent) => {
    if (!isExtensionNoise(event.error ?? event.message)) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
  };

  window.onunhandledrejection = (event) => {
    if (isExtensionNoise(event?.reason)) {
      event?.preventDefault?.();
      return true;
    }

    if (typeof previousOnUnhandledRejection === 'function') {
      return previousOnUnhandledRejection.call(window, event);
    }

    return false;
  };

  window.onerror = (message, source, lineno, colno, error) => {
    if (isExtensionNoise(error ?? message)) {
      return true;
    }

    if (typeof previousOnError === 'function') {
      return previousOnError.call(window, message, source, lineno, colno, error);
    }

    return false;
  };

  window.addEventListener('unhandledrejection', onUnhandledRejection, true);
  window.addEventListener('error', onWindowError, true);
  document.addEventListener('unhandledrejection', onUnhandledRejection as EventListener, true);
  document.addEventListener('error', onWindowError as EventListener, true);

  return () => {
    window.removeEventListener('unhandledrejection', onUnhandledRejection, true);
    window.removeEventListener('error', onWindowError, true);
    document.removeEventListener('unhandledrejection', onUnhandledRejection as EventListener, true);
    document.removeEventListener('error', onWindowError as EventListener, true);
    window.onunhandledrejection = previousOnUnhandledRejection;
    window.onerror = previousOnError;
  };
}

/**
 * Suppresses benign noise from browser extensions (copy helpers, Chrome messaging).
 */
export default function ExtensionNoiseFilter() {
  useEffect(() => {
    patchConsole();
    return patchPromiseRejections();
  }, []);

  return null;
}
