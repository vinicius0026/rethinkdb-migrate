'use strict'

const Code = require('code')
const Lab = require('lab')

const lab = exports.lab = Lab.script()
const describe = lab.experiment
const expect = Code.expect
const it = lab.test

const Migration = require('../lib')

describe('Module Interface Tests', () => {
  it('returns an object with create and migrate functions', done => {
    expect(Migration.create).to.be.a.function()
    expect(Migration.migrate).to.be.a.function()
    done()
  })
})
