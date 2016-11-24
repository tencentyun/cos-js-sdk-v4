/* global require */
var gulp = require('gulp'), gulpLoadPlugins = require('gulp-load-plugins'), plugins = gulpLoadPlugins();
var uglify = require('gulp-uglify');

gulp.task('default', function () {
	gulp.run(['rjs']);
});


var concatTask = function () {
	gulp.src(["../src/*.js"])
		.pipe(uglify({
			preserveComments:'license'
		}))
		.pipe(plugins.concat("cos-js-sdk-v4.js"))
		.pipe(gulp.dest("../dist").on('finish', function () {
			console.log('concat done...');
		}));
};

gulp.task('rjs', function () {

	concatTask();

	// 文件合并
	gulp.watch("../src/*.js", function (event) {

		concatTask();
	});
});
