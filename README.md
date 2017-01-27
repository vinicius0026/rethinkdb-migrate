# rethinkdb-migrate

[![Build Status](https://travis-ci.org/vinicius0026/rethinkdb-migrate.svg?branch=master)](https://travis-ci.org/vinicius0026/rethinkdb-migrate)
[![Coverage Status](https://coveralls.io/repos/github/vinicius0026/rethinkdb-migrate/badge.svg?branch=master)](https://coveralls.io/github/vinicius0026/rethinkdb-migrate?branch=master)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
[![Dependencies](https://david-dm.org/vinicius0026/rethinkdb-migrate.svg)](https://david-dm.org/vinicius0026/rethinkdb-migrate)

Rethinkdb migration tool

## Acknowledgement

This tool is highly inspired by, or, should I say, is a rewrite of, Johan Öbrink's
[`rethink-migrate`](https://github.com/JohanObrink/rethink-migrate). Unfortunately,
`rethink-migrate` got stale. This is an attempt to improve the code and tests,
track test coverage, update syntax to ES2015 and enhance functionality.

## Install

You can either install `rethinkdb-migrate` globally:

`npm install -g rethinkdb-migrate`

Or define a `npm script` for migration and install `rethinkdb-migrate` locally:

`npm install rethinkdb-migrate`

In `package.json`:

```json
{
  "scripts": {
    "migrate": "rethinkdb-migrate"
  }
}
```

In this last case, `rethinkdb-migrate` should be run as:

`npm run migrate <commands>`

All examples will consider that `rethinkdb-migrate` is installed globally.

## Usage

There are currently three operations supported by `rethinkdb-migrate`:

Operation | Command | Description
---|---|---
create | `rethinkdb-migrate create <migration-name>` | Creates a migration with the given name
up | `rethinkdb-migrate up` | Runs all un-executed migrations up
down | `rethinkdb-migrate down` | Runs all executed migrations down

### Create

This operation creates a migration template file, where the database changes should be made.

The template exports two functions, `up` and `down`, that receive an instance of the rethinkdb driver and a connection object. These functions **must** return a `Promise`.

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

#### Options

`rethinkdb-migrate create` accepts the following options:
(see section [Passing options](#passing-options) below)

Option name | Default value | Description
---|---|---
migrationsDirectory | migrations | Directory where migration files will be saved
relativeTo | `process.cwd()` | Root path from which migration directory will be searched or created (if inexistent)'

### Up

This command will run all pending migrations up, in order of creation.

#### Options


Option name | Default value | Description
---|---|---
host | `localhost` | The host to connect to, if using rethinkdb official driver.
port | `28015` | The port to connect on, if using rethinkdb official driver.
db | None, this is required | Database name.
user | `''` | Rethinkdb user
username | `''` | Rethinkdb username
password | `''` | Rethinkdb password
authKey | `''` | Rethinkdb authKey
migrationsDirectory | migrations | Directory where migration files will be saved
relativeTo | `process.cwd()` | Root path from which migration directory will be searched or created (if inexistent)'
migrationsTable | \_migrations | Table where meta information about migrations will be saved. This should only be changed if you need a \_migrations table in your application





### Passing options
// TODO

## Contributing

Feel free to suggest improvements and to open PRs.

- Install and run rethinkdb in the default host and port (`localhost:28015`)
- Clone this repo
- `npm install`
- `npm test`

## License

MIT License
