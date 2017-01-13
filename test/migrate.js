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
    const Migrate = require('../lib/migrate')
    let conn

    // Running up migration from fixtures/migrations directory (2 migrations)
    Migrate({
      op: 'up',
      migrationsDirectory: 'migrations',
      relativeTo: Path.resolve(__dirname, 'fixtures'),
      db: testDb
    })
    // Running migrations from fixtures/migrations2 directory, only 1 migration should be run
    .then(() => Migrate({
      op: 'up',
      migrationsDirectory: 'migrations2',
      relativeTo: Path.resolve(__dirname, 'fixtures'),
      db: testDb
    }))
    .then(() => r.connect({ db: testDb }))
    .then(_conn => {
      conn = _conn

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
        { companyId: 'shield', name: 'Steve Rogers' },
        { companyId: 'shield', name: 'Natalia Alianovna Romanova' },
        { companyId: 'shield', name: 'Robert Bruce Banner' }
      ])

      expect(employeesIdStripped).to.not
        .include({ companyId: 'shield', name: 'Tony Stark' })
    })
    .then(() => {
      conn.close(done)
    })
    .catch(done)
  })
})
