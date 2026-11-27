export {
  GuardedXMLHttpRequest as XMLHttpRequest,
  blockedFetch as fetch,
} from '../network';
export { storageShim as localStorage } from '../storage';
export {
  CustomEventShim as CustomEvent,
  addEventListenerShim as addEventListener,
  dispatchEventShim as dispatchEvent,
  documentShim as document,
  locationShim as location,
  navigatorShim as navigator,
  removeEventListenerShim as removeEventListener,
  screenShim as screen,
  windowShim as window,
} from './browser';
