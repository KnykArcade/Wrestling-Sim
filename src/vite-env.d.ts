/// <reference types="vite/client" />

declare const __APP_BUILD_COMMIT__: string;
declare const __APP_BUILD_HAS_CHANGES__: boolean;
declare const __APP_RELEASE_LABEL__: string;

declare module "buffer/" {
  export { Buffer } from "buffer";
}
