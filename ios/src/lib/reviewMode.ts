// Module-level flag — set once when Apple reviewer taps the hidden button.
// Persists for the session without needing React state.
let _active = false;

export const isReviewMode = () => _active;
export const enableReviewMode = () => { _active = true; };
