/* ============ 复习页 ============ */
let revKind = 'review';
function openReview(kind, opt = {}) { go('session', { kind, ...opt }); }
