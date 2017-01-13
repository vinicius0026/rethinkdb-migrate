'use strict'

const Fs = require('fs-extra')
const Joi = require('joi')
const Path = require('path')
const Moment = require('moment')

const internals = {}

module.exports = function (opt) {
  return validateOptions(opt)
    .then(createDirectory)
    .then(createMigration)
}

function validateOptions (options) {
  const schema = Joi.object().keys({
    name: Joi.string().required().description('Migration name'),
    migrationsDirectory: Joi.string().default('migrations')
      .description('Directory where migration files will be saved'),
    relativeTo: Joi.string().default(process.cwd())
      .description('Root path from which migration directory will be searched')
  }).required()

  return new Promise((resolve, reject) => {
    Joi.validate(options, schema, (err, validated) => {
      if (err) {
        return reject(err)
      }

      resolve(validated)
    })
  })
}

function createDirectory (options) {
  return new Promise((resolve, reject) => {
    const path = Path.resolve(options.relativeTo, options.migrationsDirectory)

    Fs.mkdirs(path, err => {
      if (err) {
        return reject(err)
      }

      resolve(Object.assign({}, options, { path }))
    })
  })
}

function createMigration (options) {
  return new Promise((resolve, reject) => {
    const filename = `${Moment.utc().format('YYYYMMDDHHmmss')}-${options.name}.js`
    const fullPath = Path.resolve(options.path, filename)

    Fs.writeFile(fullPath, internals.template, err => {
      if (err) {
        return reject(err)
      }

      resolve(fullPath)
    })
  })
}

internals.template = Fs.readFileSync(Path.resolve(__dirname, 'template.js'))
