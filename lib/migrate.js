'use strict'

const Fs = require('fs')
const Joi = require('joi')
const Mask = require('json-mask')
const Moment = require('moment')
const Path = require('path')

module.exports = function (opt) {
  return validateOptions(opt)
    .then(connectToRethink)
    .then(createDbIfInexistent)
    .then(executeMigration)
    .then(closeConnection)
}

function validateOptions (options) {
  const schema = Joi.object().keys({
    op: Joi.string().valid('up', 'down').required()
      .description('Migration command'),
    migrationsTable: Joi.string().default('_migrations')
      .description('Table where meta information about migrations will be saved'),
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
    authKey: Joi.string().description('Rethinkdb authkey')
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

function connectToRethink (options) {
  const r = require('rethinkdb')

  return r.connect(Mask(options, 'host,port,user,username,password,authKey'))
    .then(conn => {
      return Object.assign({}, options, { r, conn })
    })
}

function createDbIfInexistent (options) {
  const { r, conn, db } = options

  return r.dbList().run(conn)
    .then(list => {
      if (list.indexOf(db) < 0) {
        return r.dbCreate(db).run(conn)
      }
    })
    .then(() => {
      conn.use(db)
      return options
    })
}

function executeMigration (options) {
  const proxyTable = {
    up: migrateUp,
    down: migrateDown
  }

  return proxyTable[options.op](options)
}

function migrateUp (options) {
  return getLatestMigrationExecuted(options)
    .then(latest => getUnExecutedMigrations(latest, options))
    .then(newerMigrations => runMigrations('up', newerMigrations, options))
    .then(executedMigrations => saveExecutedMigrationsMetadata(executedMigrations, options))
    .then(() => options)
}

function migrateDown (options) {
  return getAllMigrationsExecuted(options)
    .then(migrations => runMigrations('down', migrations, options))
    .then(() => clearMigrationsTable(options))
    .then(() => options)
}

function getLatestMigrationExecuted (options) {
  return ensureMigrationsTable(options)
    .then(() => getAllMigrationsExecuted(options))
    .then(migrations => {
      if (!migrations || !migrations.length) {
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
    .then(list => {
      if (list.indexOf(migrationsTable) < 0) {
        return r.tableCreate(migrationsTable).run(conn)
          .then(() => r.table(migrationsTable).indexCreate('timestamp').run(conn))
          .then(() => r.table(migrationsTable).indexWait().run(conn))
      }
    })
}

function getAllMigrationsExecuted (options) {
  const { r, conn, migrationsTable } = options

  return ensureMigrationsTable(options)
    .then(() => r.table(migrationsTable)
      .orderBy({ index: 'timestamp' })
      .run(conn)
      .then(cursor => cursor.toArray())
      .then(arr => {
        return arr
      })
    )
    .then(migrations => migrations.map(migration => Object.assign({}, migration, {
      timestamp: Moment.utc(migration.timestamp)
    })))
}

function getUnExecutedMigrations (latestExecutedMigration, options) {
  const { migrationsDirectory, relativeTo } = options
  const path = Path.resolve(relativeTo, migrationsDirectory)
  const migrationRegExp = /^(\d{14})-(.*)\.js$/

  return new Promise((resolve, reject) => {
    Fs.readdir(path, (err, files) => {
      if (err) {
        return reject(err)
      }
      resolve(files)
    })
  })
  .then(files => files.filter(file => file.match(migrationRegExp)))
  .then(migrationFiles => migrationFiles.map(filename => {
    const [, timestamp, name] = filename.match(migrationRegExp)

    return {
      timestamp: Moment.utc(timestamp, 'YYYYMMDDHHmmss'),
      name: name,
      filename
    }
  }))
  .then(migrations => filterMigrationsOlderThan(migrations, latestExecutedMigration.timestamp))
  .then(sortMigrations)
  .then(migrations => loadMigrationsCode(migrations, options))
}

function filterMigrationsOlderThan (migrations, reference) {
  return migrations.filter(migration => migration.timestamp.isAfter(Moment(reference)))
}

function loadMigrationsCode (migrations, options) {
  const { relativeTo, migrationsDirectory } = options
  const basePath = Path.resolve(relativeTo, migrationsDirectory)
  return migrations.map(migration => Object.assign({}, migration, { code: require(Path.resolve(basePath, migration.filename)) }))
}

function sortMigrations (migrations) {
  return migrations.sort((a, b) => {
    if (a.timestamp.isBefore(b.timestamp)) {
      return -1
    } else if (b.timestamp.isBefore(a.timestamp)) {
      return 1
    }
    return 0
  })
}

function runMigrations (direction, migrations, options) {
  const { r, conn } = options
  return migrations
    .reduce((chain, migration) => chain.then(() => migration.code[direction](r, conn)), Promise.resolve())
    .then(() => migrations)
}

function saveExecutedMigrationsMetadata (migrations, options) {
  const { r, conn, migrationsTable } = options

  return migrations
    .map(migration => ({ timestamp: migration.timestamp.toISOString(), name: migration.name }))
    .reduce((chain, migration) => r.table(migrationsTable).insert(migration).run(conn), Promise.resolve())
}

function clearMigrationsTable (options) {
  const { r, conn, migrationsTable } = options

  return r.table(migrationsTable).delete().run(conn)
}

function closeConnection (options) {
  const { conn } = options

  return conn.close()
}
