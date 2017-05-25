/* global require */
var gulp = require('gulp'), gulpLoadPlugins = require('gulp-load-plugins'), plugins = gulpLoadPlugins();
var uglify = require('gulp-uglify');

gulp.task('default', ['dev']);

gulp.task('dev', ['build'], function () {
    gulp.watch('./src/*.js', ['build']);
});

gulp.task('build', function () {
    gulp.src(['./src/*.js'])
        .pipe(uglify({}))
        .pipe(plugins.concat('cos-js-sdk-v4.js'))
        .pipe(gulp.dest('./dist').on('finish', function () {
            console.log('concat done...');
        }));
});
