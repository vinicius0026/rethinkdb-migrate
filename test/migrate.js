'use strict'

const Code = require('code')
const Lab = require('lab')
const Path = require('path')
const Proxyquire = require('proxyquire')
const r = require('rethinkdb')

const lab = exports.lab = Lab.script()
const describe = lab.experiment
const expect = Code.expect
const it = lab.test
const before = lab.before
const afterEach = lab.afterEach
const beforeEach = lab.beforeEach

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

  describe('Migrate up', () => {
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
      Migrate({ db: testDb, op: 'up', relativeTo: Path.resolve(__dirname, 'fixtures') })
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
      Migrate({ op: 'up', migrationsDirectory: 'migrations', relativeTo: Path.resolve(__dirname, 'fixtures'), db: testDb })
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

          expect(employeesIdStripped).to.have.length(5)

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

    it('runs only the number of unexecuted migrations up specified in --step', done => {
      const Migrate = require('../lib/migrate')
      let conn

      const emitterMessages = []
      Migrate.emitter.on('info', (message) => {
        emitterMessages.push(message)
      })

      // Running up migration from fixtures/migrations directory (2 migrations), but limiting to only 1 migration
      Migrate({ op: 'up', migrationsDirectory: 'migrations', relativeTo: Path.resolve(__dirname, 'fixtures'), db: testDb, step: 1 })
        // Verify that only the first migration was run
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
          expect(companies).to.be.an.array()
          expect(companies).to.be.empty()

          return r.table('employees').run(conn).then(cursor => cursor.toArray())
        })
        .then(employees => {
          expect(employees).to.be.an.array()
          expect(employees).to.be.empty()
        })
        // Running migrations from fixtures/migrations2 directory, the last 2 migration should be run
        .then(() => Migrate({
          op: 'up',
          migrationsDirectory: 'migrations2',
          relativeTo: Path.resolve(__dirname, 'fixtures'),
          db: testDb
        }))
        .then(() => r.table('employees').run(conn).then(cursor => cursor.toArray()))
        .then(employees => {
          const employeesIdStripped = employees.map(employee => {
            const employeeIdStripped = Object.assign({}, employee)
            delete employeeIdStripped.id
            return employeeIdStripped
          })

          expect(employeesIdStripped).to.have.length(5)

          expect(employeesIdStripped).to.include([
            { companyId: 'acme', name: 'Wile E Coyote' },
            { companyId: 'acme', name: 'Road Runner' },
            { companyId: 'shield', name: 'Steve Rogers' },
            { companyId: 'shield', name: 'Natalia Alianovna Romanova' },
            { companyId: 'shield', name: 'Robert Bruce Banner' }
          ])

          expect(employeesIdStripped).to.not
            .include({ companyId: 'shield', name: 'Tony Stark' })
          emitterMessages.length = 0
        })
        .then(() => Migrate({
          op: 'up',
          migrationsDirectory: 'migrations2',
          relativeTo: Path.resolve(__dirname, 'fixtures'),
          db: testDb
        }))
        .then(() => {
          expect(emitterMessages).to.include([
            'No migrations executed.'
          ])
        })
        .then(() => {
          conn.close(done)
        })
        .catch(done)
    })

    it('rejects promise if error reading migration files', done => {
      const Migrate = Proxyquire('../lib/migrate', {
        fs: {
          readdir: (path, cb) => cb(new Error('Error reading migrations directory'))
        }
      })

      Migrate({ op: 'up', db: testDb })
        .catch(err => {
          expect(err).to.exist()
          expect(err.message).to.equal('Error reading migrations directory')
          done()
        })
    })

    it('works with rethinkdbdash (no pools, cursor true as defaults)', done => {
      const Migrate = require('../lib/migrate')
      let conn
      Migrate({ db: testDb, op: 'up', driver: 'rethinkdbdash', relativeTo: Path.resolve(__dirname, 'fixtures') })
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

    it('works with rethinkdbdash (no pools, cursor false)', done => {
      const Migrate = require('../lib/migrate')
      let conn
      Migrate({ db: testDb, op: 'up', driver: 'rethinkdbdash', cursor: false, relativeTo: Path.resolve(__dirname, 'fixtures') })
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

    it('works with rethinkdbdash (with pools === true, cursor false)', done => {
      const Migrate = require('../lib/migrate')
      let conn
      Migrate({
        db: testDb,
        op: 'up',
        driver: 'rethinkdbdash',
        cursor: false,
        pool: true,
        relativeTo: Path.resolve(__dirname, 'fixtures')
      }).then(() => r.connect({ db: testDb }))
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

    it('works with rethinkdbdash (with pools === true, cursor false and servers specified)', done => {
      const Migrate = require('../lib/migrate')
      let conn
      Migrate({
        db: testDb,
        op: 'up',
        driver: 'rethinkdbdash',
        cursor: false,
        pool: true,
        servers: [
          { host: 'localhost', port: 28015 },
          { host: 'localhost', port: 28016 }
        ],
        relativeTo: Path.resolve(__dirname, 'fixtures')
      }).then(() => r.connect({ db: testDb }))
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

    it('works with rethinkdbdash (with pools === true and servers specified in port different than 28015)', done => {
      const Migrate = require('../lib/migrate')
      let r = require('rethinkdbdash')
      Migrate({
        db: testDb,
        op: 'up',
        driver: 'rethinkdbdash',
        cursor: false,
        pool: true,
        servers: [
          { host: 'localhost', port: 48015 }
        ],
        relativeTo: Path.resolve(__dirname, 'fixtures')
      }).catch(err => console.error(err))
        .then(() => {
          r = require('rethinkdbdash')({
            db: testDb,
            cursor: false,
            pool: true,
            servers: [
              { host: 'localhost', port: 48015 }
            ]
          })

          return r.tableList().run()
        })
        .then(tables => {
          expect(tables).to.be.an.array()
          expect(tables).to.include('companies')
          expect(tables).to.include('employees')

          return r.table('companies').run()
        })
        .then(companies => {
          expect(companies).to.include([
            { id: 'acme', name: 'ACME' },
            { id: 'shield', name: 'S.H.I.E.L.D' }
          ])

          return r.table('employees').run()
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
        .then(() => r.dbDrop(testDb))
        .then(() => r.getPoolMaster().drain())
        .then(done)
        .catch(err => {
          return r.dbDrop(testDb)
            .then(() => done(err))
            .catch(done)
        })
    })
  })

  describe('Migrate down', () => {
    const Migrate = require('../lib/migrate')

    afterEach(internals.cleanDb)
    beforeEach(internals.cleanDb)

    it('run migrate down, undoing all migrations', done => {
      let conn

      // running up migration before test
      Migrate({ op: 'up', relativeTo: Path.resolve(__dirname, 'fixtures'), db: testDb })
        // Running down migration and testing
        .then(() => Migrate({ op: 'down', relativeTo: Path.resolve(__dirname, 'fixtures'), db: testDb }))
        .then(() => r.connect({ db: testDb }))
        .then(_conn => {
          conn = _conn

          return r.tableList().run(conn)
        })
        .then(list => {
          expect(list).to.have.length(1)
          expect(list[0]).to.equal('_migrations')

          return r.table('_migrations').run(conn).then(cursor => cursor.toArray())
        })
        .then(entries => {
          expect(entries).to.be.an.array()
          expect(entries).to.have.length(0)
        })
        .then(() => {
          conn.close(done)
        })
        .catch(done)
    })

    it('migrates down only specified number of steps in --step option', done => {
      let conn
      const emitterMessages = []
      Migrate.emitter.on('info', (message) => {
        emitterMessages.push(message)
      })

      // running up migration before test
      Migrate({
        op: 'up',
        migrationsDirectory: 'migrations2',
        relativeTo: Path.resolve(__dirname, 'fixtures'),
        db: testDb
      })
        .then(() => r.connect({ db: testDb }))
        .then(_conn => {
          conn = _conn

          return r.tableList().run(conn).then(cursor => cursor.toArray())
        })
        .then((tableList) => {
          expect(tableList).to.be.an.array()
          expect(tableList).to.have.length(3)
          expect(emitterMessages).to.include('Executed 3 migrations.')
        })
        .then(() => { emitterMessages.length = 0 })
        // Running down migration and testing
        .then(() => Migrate({
          op: 'down',
          relativeTo: Path.resolve(__dirname, 'fixtures'),
          db: testDb,
          step: 2,
          migrationsDirectory: 'migrations2'
        }))
        .then(() => {
          expect(emitterMessages).to.include([
            'Cleared 2 migrations from table.',
            'Executed migration remove-data down',
            'Executed migration insert-data down'
          ])
          expect(emitterMessages).not.to.include([
            'Executed migration create-table down'
          ])
          emitterMessages.length = 0
        })
        .then(() => r.tableList().run(conn))
        .then(tables => {
          expect(tables).to.have.length(3)
          expect(tables).to.include([
            'companies', 'employees'
          ])

          return r.table('companies').run(conn).then(cursor => cursor.toArray())
        })
        .then((companies) => {
          expect(companies).to.be.an.array()
          expect(companies).to.be.empty()

          return r.table('employees').run(conn).then(cursor => cursor.toArray())
        })
        .then((employees) => {
          expect(employees).to.be.an.array()
          expect(employees).to.be.empty()

          return r.table('_migrations').run(conn).then(cursor => cursor.toArray())
        })
        .then((remainingMigrations) => {
          expect(remainingMigrations).to.have.length(1)
        })
        // Expect only one migration to run -- although we passed it 2, because only one remains to be rolled back
        .then(() => Migrate({
          op: 'down',
          relativeTo: Path.resolve(__dirname, 'fixtures'),
          db: testDb,
          step: 2,
          migrationsDirectory: 'migrations2'
        }))
        .then(() => {
          expect(emitterMessages).to.include([
            'Cleared 1 migration from table.',
            'Executed migration create-table down'
          ])
          expect(emitterMessages).not.to.include([
            'Executed migration remove-data down',
            'Executed migration insert-data down'
          ])
          emitterMessages.length = 0
        })
        .then(() => {
          return r.tableList().run(conn)
        })
        .then(list => {
          expect(list).to.have.length(1)
          expect(list[0]).to.equal('_migrations')

          return r.table('_migrations').run(conn).then(cursor => cursor.toArray())
        })
        .then(entries => {
          expect(entries).to.be.an.array()
          expect(entries).to.have.length(0)
        })
        .then(() => Migrate({
          op: 'down',
          relativeTo: Path.resolve(__dirname, 'fixtures'),
          db: testDb,
          step: 2,
          migrationsDirectory: 'migrations2'
        }))
        .then(() => {
          expect(emitterMessages).to.include([
            'Migrations table already clear.'
          ])
        })
        .then(() => {
          conn.close(done)
        })
        .catch(done)
    })
  })
})
