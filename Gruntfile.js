'use strict'

module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-release')

  grunt.initConfig({
    release: {
      options: {
        npm: true,
        indentation: '  '
      }
    }
  })
}
