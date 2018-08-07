'use strict'

const EventEmitter = require('events')
const Fs = require('fs')
const Joi = require('joi')
const Mask = require('json-mask')
const Moment = require('moment')
const Path = require('path')

const internals = {}

const Migrate = function (opt) {
  emit('info', 'Validating options')()
  return validateOptions(opt)
    .then(emit('info', 'Connecting to RethinkDB'))
    .then(connectToRethink)
    .then(createDbIfInexistent)
    .then(emit('info', 'Executing Migrations'))
    .then(executeMigration)
    .then(emit('info', 'Closing connection'))
    .then(closeConnection)
}

internals.emitter = new EventEmitter()

Migrate.emitter = internals.emitter

module.exports = Migrate

function validateOptions (options) {
  const schema = Joi.object().keys({
    op: Joi.string().valid('up', 'down').required()
      .description('Migration command'),
    step: Joi.number().min(1)
      .description('Number of migrations to perform (migrations are counted as each migration file)'),
    driver: Joi.string().valid('rethinkdb', 'rethinkdbdash').default('rethinkdb')
      .description('Rethinkdb javascript driver'),
    migrationsTable: Joi.string().default('_migrations')
      .description('Table where meta information about migrations will be saved'),
    ignoreTimestamp: Joi.boolean().default(0)
      .description('Ignore timestamp when applying migrations'),
    migrationsDirectory: Joi.string().default('migrations')
      .description('Directory where migration files will be saved'),
    relativeTo: Joi.string().default(process.cwd())
      .description('Root path from which migration directory will be searched'),
    host: Joi.string().default('localhost')
      .description('The host to connect to, if using rethinkdb official driver'),
    port: Joi.number().default(28015)
      .description('The port to connect on, if using rethinkdb official driver'),
    db: Joi.string().required().description('Database name'),
    user: Joi.string().description('Rethinkdb user'),
    username: Joi.string().description('Rethinkdb username'),
    password: Joi.string().description('Rethinkdb password'),
    authKey: Joi.string().description('Rethinkdb authkey'),
    silent: Joi.boolean().default(false).description('Suppress logs'),
    discovery: Joi.any().when('driver', { is: 'rethinkdb', then: Joi.any().forbidden(), otherwise: Joi.boolean() })
      .description('Whether or not the driver should try to keep a list of updated hosts'),
    pool: Joi.any().when('driver', { is: 'rethinkdb', then: Joi.any().forbidden(), otherwise: Joi.boolean().default(false) })
      .description('Whether or not to use a connection pool'),
    cursor: Joi.any().when('driver', { is: 'rethinkdb', then: Joi.any().forbidden(), otherwise: Joi.boolean().default(true) })
      .description('If true, cursors will not be automatically converted to arrays when using rethinkdbdash'),
    servers: Joi.any().when('driver', {
      is: 'rethinkdb',
      then: Joi.any().forbidden(),
      otherwise: Joi.array().items(Joi.object().keys({
        host: Joi.string()
          .description('The host to connect to'),
        port: Joi.number().default(28015)
          .description('The port to connect on')
      }))
    }),
    ssl: Joi.alternatives().try(Joi.object(), Joi.boolean()).default(false).description('Rethinkdb SSL/TLS support')
  }).without('user', 'username').without('password', 'authKey').required()

  return new Promise((resolve, reject) => {
    Joi.validate(options, schema, (err, validated) => {
      if (err) {
        return reject(err)
      }

      resolve(validated)
    })
  })
}

function wait (options) {
  if (options.driver === 'rethinkdb') {
    return Promise.resolve(options)
  }

  const { r, conn, db } = options

  return r.dbList().run(conn)
    .then(toArray)
    .then(list => {
      if (list.indexOf(db) !== -1) {
        return r
          .db(options.db).wait([
            { waitFor: 'ready_for_writes', timeout: 20 }
          ])
          .run(conn)
          .then(() => options)
      }
      return Promise.resolve(options)
    })
}

function connectToRethink (options) {
  const r = selectDriver(options)

  if (options.driver === 'rethinkdbdash' && options.servers && options.pool) {
    return Promise.resolve(Object.assign({}, options, { r }))
  }

  if (options.host && options.port) {
    return r.connect(Mask(options, 'db,host,port,user,username,password,authKey,ssl'))
      .then(conn => {
        return Object.assign({}, options, { r, conn })
      })
  }
}

function selectDriver (options) {
  if (options.driver === 'rethinkdb') {
    return require('rethinkdb')
  }
  return require('rethinkdbdash')(Mask(options, 'db,user,host,port,username,password,authKey,silent,discovery,pool,cursor,servers,ssl'))
}

function createDbIfInexistent (options) {
  const { r, conn, db } = options

  return r.dbList().run(conn)
    .then(toArray)
    .then(list => {
      if (list.indexOf(db) < 0) {
        emit('info', 'Creating db', db)()
        return r.dbCreate(db).run(conn)
      }
    })
    .then(() => {
      if (options.driver === 'rethinkdb' || !options.pool) {
        conn.use(db)
      }
      return options
    })
    .then(wait)
}

function toArray (cursor) {
  if (Array.isArray(cursor)) {
    return Promise.resolve(cursor)
  }

  return cursor.toArray()
}

function executeMigration (options) {
  const proxyTable = {
    up: migrateUp,
    down: migrateDown
  }

  return proxyTable[options.op](options)
}

function migrateUp (options) {
  let steps
  return getLatestMigrationExecuted(options)
    .then(latest => getUnExecutedMigrations(latest, options))
    .then(newerMigrations => {
      const migrationSteps = limitToSteps(newerMigrations, options)
      steps = migrationSteps.length
      return migrationSteps
    })
    .then(migrationSteps => runMigrations('up', migrationSteps, options))
    .then(emit('info', 'Saving metadata'))
    .then(executedMigrations => saveExecutedMigrationsMetadata(executedMigrations, options))
    .then(() => {
      const migrationMessage = steps
        ? `Executed ${steps} migration${steps > 1 ? 's' : ''}.`
        : `No migrations executed.`
      emit('info', migrationMessage)()
    })
    .then(() => options)
}

function migrateDown (options) {
  let steps
  return getExecutedMigrations(options)
    .then(migrations => loadMigrationsCode(migrations, options))
    .then(migrations => {
      const migrationSteps = limitToSteps(migrations, options)
      steps = migrationSteps.length
      return migrationSteps
    })
    .then(migrationSteps => runMigrations('down', migrationSteps, options))
    .then(rolledBackMigrations => clearMigrationsTable(rolledBackMigrations, options))
    .then(() => {
      const migrationMessage = steps
        ? `Cleared ${steps} migration${steps > 1 ? 's' : ''} from table.`
        : 'Migrations table already clear.'
      emit('info', migrationMessage)()
    })
    .then(() => options)
}

function limitToSteps (migrations, options) {
  return options.step ? migrations.slice(0, options.step) : migrations
}

function getLatestMigrationExecuted (options) {
  return ensureMigrationsTable(options)
    .then(() => getExecutedMigrations(options))
    .then(migrations => {
      if (!migrations.length) {
        return {
          timestamp: Moment().year(1900)
        }
      }
      return migrations[0]
    })
}

function ensureMigrationsTable (options) {
  const { r, conn, migrationsTable } = options

  return r.tableList().run(conn)
    .then(toArray)
    .then(list => {
      if (list.indexOf(migrationsTable) < 0) {
        return r.tableCreate(migrationsTable).run(conn)
          .then(() => r.table(migrationsTable).indexCreate('timestamp').run(conn))
          .then(() => r.table(migrationsTable).indexWait().run(conn))
      }
    })
}

function getMigrationsFromPath (options) {
  const { migrationsDirectory, relativeTo } = options
  const path = Path.resolve(relativeTo, migrationsDirectory)
  const migrationRegExp = /^(\d{14})-(.*)\.js$/

  return readMigrationFilenamesFromPath(path)
    .then(files => files.filter(file => file.match(migrationRegExp)))
    .then(migrationFiles => migrationFiles.map(filename => {
      const [, timestamp, name] = filename.match(migrationRegExp)

      return {
        timestamp: Moment.utc(timestamp, 'YYYYMMDDHHmmss'),
        name: name,
        filename
      }
    }))
}

function getExecutedMigrations (options) {
  const { r, conn, migrationsTable } = options

  return ensureMigrationsTable(options)
    .then(() => r.table(migrationsTable)
      .orderBy({ index: r.desc('timestamp') })
      .run(conn)
      .then(toArray)
    )
    .then(migrations => migrations.map(migration => Object.assign({}, migration, {
      timestamp: Moment.utc(migration.timestamp)
    })))
}

function getUnExecutedMigrations (latestExecutedMigration, options) {
  return getMigrationsFromPath(options)
    .then(migrations => filterMigrationsOlderThan(migrations,
      latestExecutedMigration.timestamp, options))
    .then(sortMigrations)
    .then(migrations => loadMigrationsCode(migrations, options))
}

function readMigrationFilenamesFromPath (path) {
  return new Promise((resolve, reject) => {
    Fs.readdir(path, (err, files) => {
      if (err) {
        return reject(err)
      }
      resolve(files)
    })
  })
}

function filterMigrationsOlderThan (migrations, reference, options) {
  if (!options.ignoreTimestamp) {
    return migrations.filter(migration => migration.timestamp.isAfter(Moment(reference)))
  }
  return migrations
}

function loadMigrationsCode (migrations, options) {
  const { relativeTo, migrationsDirectory } = options
  const basePath = Path.resolve(relativeTo, migrationsDirectory)
  return migrations.map(migration => Object.assign({}, migration, { code: require(Path.resolve(basePath, migration.filename)) }))
}

function sortMigrations (migrations, orderDesc = false) {
  return migrations.sort((a, b) => {
    if (a.timestamp.isBefore(b.timestamp)) {
      return orderDesc ? 1 : -1
    } else if (b.timestamp.isBefore(a.timestamp)) {
      return orderDesc ? -1 : 1
    }
    return 0
  })
}

function runMigrations (direction, migrations, options) {
  const { r, conn } = options
  return migrations.reduce(
    (chain, migration) => chain.then(() => migration.code[direction](r, conn)
      .then(emit('info', `Executed migration ${migration.name} ${options.op}`))),
    Promise.resolve()
  ).then(() => migrations)
}

function saveExecutedMigrationsMetadata (migrations, options) {
  const { r, conn, migrationsTable } = options

  return migrations
    .map(migration => ({ timestamp: migration.timestamp.toISOString(), name: migration.name, filename: migration.filename }))
    .reduce((chain, migration) => chain.then(() => r.table(migrationsTable).insert(migration).run(conn)), Promise.resolve())
}

function clearMigrationsTable (migrations, options) {
  const { r, conn, migrationsTable } = options

  return Promise.all(
    migrations.map(
      item => r.table(migrationsTable)
        .filter({filename: item.filename})
        .delete()
        .run(conn)
    )
  )
}

function closeConnection (options) {
  const { r, conn } = options

  if (options.driver === 'rethinkdbdash' && options.pool) {
    return r.getPoolMaster().drain()
      .then(() => {
        if (!options.pool) {
          return conn.close()
        }
      })
  }

  return conn.close()
}

function emit (name, data) {
  return function (arg) {
    internals.emitter.emit(name, data)
    return arg
  }
}
