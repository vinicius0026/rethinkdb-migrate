exports.up = function () {
  return Promise.resolve()
}

exports.down = function (r, connection) {
  return Promise.reject(Error('Failed migrate down intentionally.'))
}
