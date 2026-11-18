// Source text with formatting taken out, for the guard tests that pin a line of a page (`?raw`): quotes become ", every
// run of whitespace one space, the parentheses a formatter wraps around JSX that spans several lines go, and so do the
// spaces and trailing commas it puts inside brackets and before a chained `.call()`. Run both the source and the expected text through it, so a pin
// checks the same code whether or not Prettier has rewrapped the file.
export function flat(src: string): string {
  return src
    .split("'")
    .join('"')
    .replace(/\s+/g, " ")
    .replace(/\( ?</g, "<")
    .replace(/> ?\)/g, ">")
    .replace(/([([{<>]) /g, "$1")
    .replace(/ ([)\]}<>])/g, "$1")
    .replace(/ \/>/g, "/>")
    .replace(/ \./g, ".")
    .replace(/,([)\]}])/g, "$1");
}
