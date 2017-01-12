'use strict'

const Code = require('code')
const Fs = require('fs-extra')
const Lab = require('lab')
const Path = require('path')
const Proxyquire = require('proxyquire')

const lab = exports.lab = Lab.script()
const describe = lab.experiment
const expect = Code.expect
const it = lab.test

const internals = {}

describe('Create migration Tests', () => {
  it('returns a promise', done => {
    const Create = require('../lib/create')
    const promise = Create()

    expect(promise).to.be.instanceof(Promise)
    promise.catch(() => {})
    done()
  })

  it('writes file to default path if only name option is passed', done => {
    const Create = require('../lib/create')

    const defaultPath = Path.resolve(process.cwd(), 'migrations')
    const name = 'first-migration'

    Create({ name })
      .then(filePath => {
        const filename = filePath.split('/').reverse()[0]
        const path = filePath.split('/').reverse().slice(1).reverse().join('/')

        expect(filename).to.match(/^\d{14}-first-migration\.js$/)
        expect(path).to.equal(defaultPath)

        Fs.readFile(filePath, 'utf8', (err, written) => {
          expect(err).to.not.exist()
          expect(written).to.equal(internals.template)

          Fs.remove(defaultPath, done)
        })
      })
      .catch(done)
  })

  it('uses passed migrationsDirectory and relativeTo options', done => {
    const Create = require('../lib/create')

    const name = 'some-migration'
    const migrationsDirectory = 'myMigrations'
    const relativeTo = __dirname

    Create({ name, migrationsDirectory, relativeTo })
      .then(filePath => {
        const filename = filePath.split('/').reverse()[0]
        const path = filePath.split('/').reverse().slice(1).reverse().join('/')

        expect(filename).to.match(/^\d{14}-some-migration\.js$/)
        expect(path).to.equal(Path.resolve(relativeTo, migrationsDirectory))

        Fs.readFile(filePath, 'utf8', (err, written) => {
          expect(err).to.not.exist()
          expect(written).to.equal(internals.template)

          Fs.remove(path, done)
        })
      })
      .catch(done)
  })

  it('rejects promise is an error occurs while creating destination directory', done => {
    const Create = Proxyquire('../lib/create', {
      'fs-extra': {
        mkdirs: (path, cb) => cb(new Error('Error while creating directory'))
      }
    })

    const name = 'some-migration'

    Create({ name })
      .catch(err => {
        expect(err).to.exist()
        expect(err.message).to.equal('Error while creating directory')
        done()
      })
  })

  it('rejects promise if an error occurs while writing migration', done => {
    const Create = Proxyquire('../lib/create', {
      'fs-extra': {
        writeFile: (path, data, cb) => cb(new Error('Error while writing file'))
      }
    })

    const name = 'some-migration'
    const defaultPath = Path.resolve(process.cwd(), 'migrations')

    Create({ name })
      .catch(err => {
        expect(err).to.exist()
        expect(err.message).to.equal('Error while writing file')

        Fs.remove(defaultPath, done)
      })
  })
})

internals.template = Fs.readFileSync(Path.resolve(__dirname, '../lib/template.js'), 'utf8')
