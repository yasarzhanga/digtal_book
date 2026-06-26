import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        reveal?: string;
        "camera-controls"?: boolean | string;
        "auto-rotate"?: boolean | string;
        "interaction-prompt"?: string;
        "shadow-intensity"?: string;
        exposure?: string;
      };
    }
  }
}
