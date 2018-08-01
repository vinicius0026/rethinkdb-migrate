# rethinkdb-migrate

[![Build Status](https://travis-ci.org/vinicius0026/rethinkdb-migrate.svg?branch=master)](https://travis-ci.org/vinicius0026/rethinkdb-migrate)
[![Coverage Status](https://coveralls.io/repos/github/vinicius0026/rethinkdb-migrate/badge.svg?branch=master)](https://coveralls.io/github/vinicius0026/rethinkdb-migrate?branch=master)
[![Code Climate](https://codeclimate.com/github/vinicius0026/rethinkdb-migrate/badges/gpa.svg)](https://codeclimate.com/github/vinicius0026/rethinkdb-migrate)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
[![Dependencies](https://david-dm.org/vinicius0026/rethinkdb-migrate.svg)](https://david-dm.org/vinicius0026/rethinkdb-migrate)

RethinkDB migration tool

## Acknowledgement

This tool is highly inspired by, or, should I say, is a rewrite of, Johan Öbrink's
[`rethink-migrate`](https://github.com/JohanObrink/rethink-migrate). Unfortunately,
`rethink-migrate` got stale. This is an attempt to improve the code and tests,
track test coverage, update syntax to ES2015 and enhance functionality.

## Install

You can either install `rethinkdb-migrate` globally:

```shell
npm install -g rethinkdb-migrate
```

Or define a `npm script` for migration and install `rethinkdb-migrate` locally:

```shell
npm install rethinkdb-migrate
```

In `package.json`:

```json
{
  "scripts": {
    "migrate": "rethinkdb-migrate"
  }
}
```

In this last case, `rethinkdb-migrate` should be run as:

```shell
npm run migrate <commands>
```

All examples will consider that `rethinkdb-migrate` is installed globally.

## Usage

There are currently three operations supported by `rethinkdb-migrate`:

Operation | Command | Description
---|---|---
create | `rethinkdb-migrate create <migration-name>` | Creates a migration with the given name
up | `rethinkdb-migrate up` | Runs all un-executed migrations up
down | `rethinkdb-migrate down` | Runs all executed migrations down (unless `step` option specified)

### Create

```shell
$ rethinkdb-migrate create <migration name>
```

This operation creates a migration template file, where the database changes should be made.

The template exports two functions, `up` and `down`, that receive an instance of the RethinkDB driver and a connection object. These functions **must** return a `Promise`.

Running `rethinkdb-migrate create new-migration` will create a file `YYYYMMDDHHmmss-new-migration.js` in the directory `./migrations`. Do not change the filename in any way after creating it.

Migrations template:

```javascript
'use strict'

exports.up = function (r, connection) {
  // must return a Promise!
}

exports.down = function (r, connection) {
  // must return a Promise!
}
```

Migration example:

```javascript
'use strict'

exports.up = function (r, connection) {
  return Promise.all([
    r.tableCreate('companies').run(connection),
    r.tableCreate('employees').run(connection)
  ])
}

exports.down = function (r, connection) {
  return Promise.all([
    r.tableDrop('companies').run(connection), r.tableDrop('employees').run(connection)
  ])
}
```

### Up

```shell
$ rethinkdb-migrate up --db=mydb
```

This command will run all pending migrations up, in order of creation. See
[Options](#options) section to configure this task.

### Down

```shell
$ rethinkdb-migrate down --db=mydb
```

This command will run all `down` steps from migrations that have been run
previously.

> *Caution: this refreshes the database to before the first migration
> (potentially deleting data added since). Be very cautious about running
> this command in a production environment.*

To rollback just a subset of migrations, use the `step` option:

```shell
$ rethinkdb-migrate down --step=2 --db=mydb
```

See [Options](#options) section to further configure this task.

### Options

The following options can be passed to `rethinkdb-migrate`:

Option name | Default value | Description
---|---|---
driver | `rethinkdb` | RethinkDB javascript driver. Can be either `rethinkdb` or `rethinkdbdash`.
host | `localhost` | The host to connect to, if using RethinkDB official driver.
port | `28015` | The port to connect on, if using RethinkDB official driver.
db | None, this is required | Database name. Please note that the db will be created if it doesn't already exist, so there is no need to explicitly create it in the migrations.
user | `''` | RethinkDB user
username | `''` | RethinkDB username
password | `''` | RethinkDB password
authKey | `''` | RethinkDB authKey
ssl | false | RethinkDB SSL/TLS Support. This option can be either `true` or an options object that will be passed to [tls.connect](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback)
discovery | `false` | Whether or not the driver should try to keep a list of updated hosts. Only available when using `rethinkdbdash` driver
pool | `false` | Whether or not to use a connection pool when using `rethinkdbdash` driver.
cursor | `true` | If true, cursors will not be automatically converted to arrays when using `rethinkdbdash`.
servers | undefined | Array of `{ host, port }` of servers to connect to. Only available when using `rethinkdbdash`
step | none | Number of migrations to execute or rollback. If omitted, all migrations will be executed or rolled back, potentially refreshing the db to its initial state and resulting in data loss.
migrationsDirectory | `migrations` | Directory where migration files will be saved
relativeTo | `process.cwd()` | Root path from which migration directory will be searched or created (if inexistent)'
migrationsTable | `_migrations` | Table where meta information about migrations will be saved. This should only be changed if you need a \_migrations table in your application

Options can be passed to the script in three different ways:

- Via environment variables
- Via configuration files
- Via command line arguments

Command line options take precedence over all other forms of passing options.
Configuration file options take precedence over environment variables.

#### Passing options via environment variables

```shell
$ db=mydb rethinkdb-migrate up
```

#### Passing options via configuration file

Create a file that exports the options object (can be either a javascript file
exporting an object, or a JSON file)


```javascript
// config.js file

module.exports = {
  db: "mydb",
  driver: "rethinkdbdash",
  pool: true,
  servers: [
    { host: "localhost", port: 28015 },
    { host: "localhost", port: 28016 }
  ],
  ssl: false
}
```

```shell
$ rethinkdb-migrate up -f config.js
```


#### Passing options via command line arguments

```shell
$ rethinkdb-migrate down --db=mydb --host=127.0.0.1 --port=28016
```

## Contributing

Feel free to suggest improvements and to open PRs. Please add/modify tests to
maintain high coverage. Also, code must follow
[standard](https://github.com/feross/standard) style.

### Running tests:

In order to run tests, you need three instances of RethinkDB running, two of
those should be in a cluster.

To achieve this, do as the following:

- Install [rethinkdb](https://www.rethinkdb.com/docs/install/)
- Make sure you have two instances of RethinkDB in a cluster:

```shell
$ rethinkdb

# in another terminal session:
$ rethinkdb --port-offset 1 --directory rethinkdb_data2 --join localhost:29015
```

- Make sure you have a third instance of rethinkdb running in port 48015:

```shell
$ rethinkdb -d rethinkdb_data3 --cluster-port 29017 --no-http-admin --driver-port 48015
```

- Clone this repo
- Make sure you are running node version >= 6
- `npm install`
- `npm test`

## License

MIT License
