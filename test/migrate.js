'use strict'

const Code = require('code')
const Lab = require('lab')
const Moment = require('moment')
const Path = require('path')
const r = require('rethinkdb')

const lab = exports.lab = Lab.script()
const describe = lab.experiment
const expect = Code.expect
const it = lab.test
const before = lab.before
const afterEach = lab.afterEach

const testDb = 'migrations_test_db'

const internals = {}

internals.cleanDb = function (done) {
  let conn
  r.connect({ db: testDb })
    .then(_conn => {
      conn = _conn

      return r.dbList().run(conn).then(cursor => cursor.toArray())
    })
    .then(list => {
      if (list.indexOf(testDb) !== -1) {
        return r.dbDrop(testDb).run(conn)
      }
    })
    .then(() => {
      conn.close(done)
    })
    .catch(done)
}

describe('Migrate tests', { timeout: 10000 }, () => {
  before(internals.cleanDb)

  afterEach(internals.cleanDb)

  it('returns a promise', done => {
    const Migrate = require('../lib/migrate')
    const promise = Migrate()

    expect(promise).to.be.instanceof(Promise)
    promise.catch(() => {})
    done()
  })

  it('runs all migrations up if no migration has been previously executed', done => {
    const Migrate = require('../lib/migrate')
    let conn
    Migrate({
      db: testDb,
      op: 'up',
      relativeTo: Path.resolve(__dirname, 'fixtures')
    })
    .then(() => r.connect({ db: testDb }))
    .then(_conn => {
      conn = _conn

      return r.tableList().run(conn)
    })
    .then(tables => {
      expect(tables).to.be.an.array()
      expect(tables).to.include('companies')
      expect(tables).to.include('employees')

      return r.table('companies').run(conn).then(cursor => cursor.toArray())
    })
    .then(companies => {
      expect(companies).to.include([
        { id: 'acme', name: 'ACME' },
        { id: 'shield', name: 'S.H.I.E.L.D' }
      ])

      return r.table('employees').run(conn).then(cursor => cursor.toArray())
    })
    .then(employees => {
      const employeesIdStripped = employees.map(employee => {
        const employeeIdSripped = Object.assign({}, employee)
        delete employeeIdSripped.id
        return employeeIdSripped
      })

      expect(employeesIdStripped).to.include([
        { companyId: 'acme', name: 'Wile E Coyote' },
        { companyId: 'acme', name: 'Road Runner' },
        { companyId: 'shield', name: 'Tony Stark' },
        { companyId: 'shield', name: 'Steve Rogers' },
        { companyId: 'shield', name: 'Natalia Alianovna Romanova' },
        { companyId: 'shield', name: 'Robert Bruce Banner' }
      ])
    })
    .then(() => {
      conn.close(done)
    })
    .catch(done)
  })

  it('runs only migrations that have not been executed yet', done => {
    // test setup
    let conn
    r.connect({ db: testDb })
      .then(_conn => {
        conn = _conn

        return r.dbCreate(testDb).run(conn)
      })
      // Running first migration manually
      .then(() => Promise.all([
        r.tableCreate('companies').run(conn),
        r.tableCreate('employees').run(conn),
        r.tableCreate('_migrations').run(conn) // default migrations table
      ]))
      .then(() => r.table('_migrations').indexCreate('timestamp').run(conn))
      .then(() => r.table('_migrations').indexWait().run(conn))
      .then(() => {
        const filename = '20151005145709-create-table.js'
        const [, timestamp, name] = filename.match(/^(\d{14})-(.*)\.js$/)

        return r.table('_migrations').insert({ timestamp: Moment.utc(timestamp, 'YYYYMMDDHHmmss').toISOString(), name }).run(conn)
      })
      .then(() => conn.close())
      // Actually run test:
      .then(() => {
        const Migrate = require('../lib/migrate')
        return Migrate({
          db: testDb,
          op: 'up',
          relativeTo: Path.resolve(__dirname, 'fixtures')
        })
      })
      .then(() => r.connect({ db: testDb }))
      .then(_conn => {
        conn = _conn

        return r.table('companies').run(conn).then(cursor => cursor.toArray())
      })
      .then(companies => {
        expect(companies).to.include([
          { id: 'acme', name: 'ACME' },
          { id: 'shield', name: 'S.H.I.E.L.D' }
        ])

        return r.table('employees').run(conn).then(cursor => cursor.toArray())
      })
      .then(employees => {
        const employeesIdStripped = employees.map(employee => {
          const employeeIdSripped = Object.assign({}, employee)
          delete employeeIdSripped.id
          return employeeIdSripped
        })

        expect(employeesIdStripped).to.include([
          { companyId: 'acme', name: 'Wile E Coyote' },
          { companyId: 'acme', name: 'Road Runner' },
          { companyId: 'shield', name: 'Tony Stark' },
          { companyId: 'shield', name: 'Steve Rogers' },
          { companyId: 'shield', name: 'Natalia Alianovna Romanova' },
          { companyId: 'shield', name: 'Robert Bruce Banner' }
        ])
      })
      .then(() => {
        conn.close(done)
      })
      .catch(done)
  })
})
