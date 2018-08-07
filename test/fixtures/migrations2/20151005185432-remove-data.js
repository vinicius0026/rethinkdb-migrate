exports.up = function (r, connection) {
  return Promise.all([
    r.table('employees').filter({ name: 'Tony Stark' }).delete().run(connection)
  ])
}

exports.down = function (r, connection) {
  return r.table('employees').insert({ companyId: 'shield', name: 'Tony Stark' }).run(connection)
}
