# rethinkdb-migrate

[![Build Status](https://travis-ci.org/vinicius0026/rethinkdb-migrate.svg?branch=master)](https://travis-ci.org/vinicius0026/rethinkdb-migrate)
[![Standard - JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
[![Dependencies](https://david-dm.org/vinicius0026/rethinkdb-migrate.svg)](https://david-dm.org/vinicius0026/rethinkdb-migrate)

Rethinkdb migration tool

## Acknowledgement

This tool is highly inspired by, or, should I say, a rewrite of, Johan Öbrink
[`rethink-migrate`](https://github.com/JohanObrink/rethink-migrate). Unfortunately,
`rethink-migrate` got stale. This is an attempt to improve the code and tests,
track test coverage, update syntax to ES2015 and enhance functionality.

## Stage

This is a work in progress. When the functionality is at par with the original
module, a v1.0 will be release.

NOTE: The CLI inteface will be mantained, but the node API will not.

## TODO

For v1.0:

- [x] Create migration
- [x] Migrate Up (run all migrations)
- [ ] Migrate down
- [x] `rethinkdb` official driver support
- [ ] Add event emiter to signal execution stage (for CLI logging)
- [ ] CLI working
- [ ] `rethinkdbdash` driver support

Improving functionality:

- [ ] Rollback (undo last executed migration)
- [ ] Run only 1 migration up

## Running tests

- Install and run rethinkdb in the default host and port (`localhost:28015`)
- Clone this repo
- `npm install`
- `npm test`

## Contributing

Feel free to suggest contributions and to open PRs.

## License

MIT License
