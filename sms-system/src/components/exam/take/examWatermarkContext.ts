import { createContext } from "react";

/** The words of the watermark over an unsupervised exam (the student's name and a short code), or null when there is none. */
export const WatermarkContext = createContext<string | null>(null);
