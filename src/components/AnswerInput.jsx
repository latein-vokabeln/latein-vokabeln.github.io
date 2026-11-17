import React, { forwardRef } from 'react';

// Text field for typed answers: no autocorrect/capitalisation on phones
export const AnswerInput = forwardRef(function AnswerInput({ className = '', ...props }, ref) {
  return (
    <input ref={ref} type="text"
      autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
      className={className}
      {...props} />
  );
});

// Latin needs no special characters: length marks (ā, ē …) are ignored by the
// answer check, so there are no accent buttons. Kept as a no-op for the callers.
export function AccentKeys() {
  return null;
}
