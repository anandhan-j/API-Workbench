/**
 * Measures the pixel position of the caret inside a textarea by rendering a
 * hidden "mirror" div that copies the textarea's styling and text up to the
 * caret, then reading the offset of a marker span. Adapted from the well-known
 * textarea-caret-position technique.
 */

const MIRRORED_PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const;

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(element: HTMLTextAreaElement, position: number): CaretCoordinates {
  const div = document.createElement('div');
  const computed = window.getComputedStyle(element);
  const style = div.style;

  style.position = 'absolute';
  style.visibility = 'hidden';
  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.overflow = 'hidden';
  const styleRecord = style as unknown as Record<string, string>;
  const computedRecord = computed as unknown as Record<string, string>;
  for (const prop of MIRRORED_PROPERTIES) {
    styleRecord[prop] = computedRecord[prop];
  }

  div.textContent = element.value.slice(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.slice(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);
  const coordinates: CaretCoordinates = {
    top: span.offsetTop + parseInt(computed.borderTopWidth, 10),
    left: span.offsetLeft + parseInt(computed.borderLeftWidth, 10),
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10),
  };
  document.body.removeChild(div);
  return coordinates;
}
