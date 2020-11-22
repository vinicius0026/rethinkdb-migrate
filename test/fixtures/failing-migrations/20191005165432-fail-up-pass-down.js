/**
 * This migration intentionally fails.
 */
exports.up = function () {
  return Promise.reject(Error('Failed migrate up intentionally.'))
}

exports.down = function () {
  return Promise.resolve()
}
