(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
		typeof define === 'function' && (define.amd || define.cmd) ? define(factory) :
			global.CosCloud = factory();
}(this, function () {
	'use strict';

	var $ = window.jQuery.noConflict(true);

	function CosCloud(opt) {
		this.appid = opt.appid;
		this.bucket = opt.bucket;
		this.region = opt.region;
        if (opt.getAppSign) {
            this.getAppSign = getEncodeFn(opt.getAppSign, this);
        }
        if (opt.getAppSignOnce) {
            this.getAppSignOnce = getEncodeFn(opt.getAppSignOnce, this);
        }
	}

    function getEncodeFn(fn, context) {
        return function (callback) {
            fn.call(context, function (s) {
                if (decodeURIComponent(s) === s && encodeURIComponent(s) !== s) {
					console.error('Signature need url encode.');
				} else {
                    callback(s);
				}
            });
        };
    }

	//512K
	var SLICE_SIZE_512K = 524288;
	//1M
	var SLICE_SIZE_1M = 1048576;
	//2M
	var SLICE_SIZE_2M = 2097152;
	//3M
	var SLICE_SIZE_3M = 3145728;
	//20M 大于20M的文件需要进行分片传输
	var MAX_UNSLICE_FILE_SIZE = 20971520;

	CosCloud.prototype.cosapi_cgi_url = "//REGION.file.myqcloud.com/files/v2/";
	CosCloud.prototype.slice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
	CosCloud.prototype.sliceSize = 3 * 1024 * 1024;
	CosCloud.prototype.getExpired = function (second) {
		return new Date().getTime() / 1000 + (second || 60);
	};

	/**
	 * 分片上传获取size
	 * @param  {int}   size     文件分片大小,Bytes
	 * return  {int}   size        文件分片大小,Bytes
	 */
	CosCloud.prototype.getSliceSize = function (size) {
		var res = SLICE_SIZE_1M;

		if (size <= SLICE_SIZE_512K) {
			res = SLICE_SIZE_512K;
		} else if (size <= SLICE_SIZE_1M) {
			res = SLICE_SIZE_1M;
		} else {
			res = SLICE_SIZE_1M;
		}


		return res;

	};


	CosCloud.prototype.set = function (opt) {

		if (opt) {
			this.appid = opt.appid;
			this.bucket = opt.bucket;
			this.region = opt.region;
			if (opt.getAppSign) {
				this.getAppSign = opt.getAppSign;
			}
			if (opt.getAppSignOnce) {
				this.getAppSignOnce = opt.getAppSignOnce;
			}
		}
	};

	CosCloud.prototype.getCgiUrl = function (destPath, sign) {
		var region = this.region;
		var bucket = this.bucket;
		var url = this.cosapi_cgi_url;
		url = url.replace('REGION', region);

		return url + this.appid + '/' + bucket + '/' + destPath + '?sign=' + sign;

	};


	CosCloud.prototype.getAppSign = function (success, error, bucketName) {
		var expired = this.getExpired();
		var url = this.sign_url + "?sign_type=appSign&expired=" + expired + "&bucketName=" + bucketName;
		$.ajax({
			url: url,
			type: "GET",
			success: success,
			error: error
		});
	};

	CosCloud.prototype.getAppSignOnce = function (success, error, path, bucketName) {
		var url = this.sign_url + "?sign_type=appSign_once&path=" + encodeURIComponent(path) + "&bucketName=" + bucketName;
		$.ajax({
			url: url,
			type: "GET",
			success: success,
			error: error
		});
	};

	CosCloud.prototype.updateFolder = function (success, error, bucketName, remotePath, bizAttribute) {
		remotePath = fixPath.call(this, remotePath, 'folder');
		this.updateBase(success, error, bucketName, remotePath, bizAttribute);
	};

	CosCloud.prototype.updateFile = function (success, error, bucketName, remotePath, bizAttribute) {
		remotePath = fixPath.call(this, remotePath);
		this.updateBase(success, error, bucketName, remotePath, bizAttribute);
	};

	CosCloud.prototype.updateBase = function (success, error, bucketName, remotePath, bizAttribute, authority, customHeaders) {
		var that = this;
		that.getAppSignOnce(function (sign) {
			var url = that.getCgiUrl(remotePath, sign);

			var formData = new FormData();
			formData.append('op', 'update');

			if (bizAttribute) {
				formData.append('biz_attr', bizAttribute);
			}
			//authority	权限类型，可选参数，可选值为eInvalid,eWRPrivate,eWPrivateRPublic
			//			文件可以与bucket拥有不同的权限类型，已经设置过权限的文件如果想要撤销，直接赋值为eInvalid，则会采用bucket的权限
			if (authority) {
				formData.append('authority', authority);
			}

			if (customHeaders) {
				customHeaders = JSON.stringify(customHeaders);
				formData.append('customHeaders', customHeaders);
			}

			$.ajax({
				type: 'POST',
				url: url,
				processData: false,
				contentType: false,
				data: formData,
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.deleteFolder = function (success, error, bucketName, remotePath) {
		remotePath = fixPath.call(this, remotePath, 'folder');
		this.deleteBase(success, error, bucketName, remotePath);
	};

	CosCloud.prototype.deleteFile = function (success, error, bucketName, remotePath) {
		remotePath = fixPath.call(this, remotePath);
		this.deleteBase(success, error, bucketName, remotePath);
	};

	CosCloud.prototype.deleteBase = function (success, error, bucketName, remotePath) {
		if (remotePath == "/") {
			error({"code": 10003, "message": "不能删除Bucket"});
			return;
		}
		var that = this;
		this.getAppSignOnce(function (sign) {
			var url = that.getCgiUrl(remotePath, sign);
			var formData = new FormData();
			formData.append('op', 'delete');
			$.ajax({
				type: 'POST',
				url: url,
				data: formData,
				processData: false,
				contentType: false,
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.getFolderStat = function (success, error, bucketName, remotePath) {
		remotePath = fixPath(remotePath, 'folder');
		this.statBase(success, error, bucketName, remotePath);
	};

	CosCloud.prototype.getFileStat = function (success, error, bucketName, remotePath) {
		remotePath = fixPath(remotePath);
		this.statBase(success, error, bucketName, remotePath);
	};

	CosCloud.prototype.statBase = function (success, error, bucketName, remotePath) {
		var that = this;
		this.getAppSign.call(that, function (sign) {
			var url = that.getCgiUrl(remotePath, sign);
			var data = {
				op: "stat"
			};
			$.ajax({
				url: url,
				type: "GET",
				data: data,
				success: success,
				error: error
			});
		});

	};

	CosCloud.prototype.createFolder = function (success, error, bucketName, remotePath, bizAttr) {
		var that = this;
		this.getAppSign(function (sign) {
			remotePath = fixPath(remotePath, 'folder');
			var url = that.getCgiUrl(remotePath, sign);
			var formData = new FormData();
			formData.append('op', 'create');
			formData.append('biz_attr', bizAttr || '');
			$.ajax({
				type: 'POST',
				url: url,
				data: formData,
				processData: false,
				contentType: false,
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.copyFile = function (success, error, bucketName, remotePath, destPath, overWrite) {
		var that = this;
		this.getAppSign(function (sign) {
			remotePath = fixPath(remotePath);
			var url = that.getCgiUrl(remotePath, sign);
			var formData = new FormData();
			formData.append('op', 'copy');
			formData.append('dest_fileid', destPath);
			formData.append('to_over_write', overWrite);

			$.ajax({
				type: 'POST',
				url: url,
				data: formData,
				processData: false,
				contentType: false,
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.moveFile = function (success, error, bucketName, remotePath, destPath, overWrite) {
		var that = this;
		this.getAppSign(function (sign) {
			remotePath = fixPath(remotePath);
			var url = that.getCgiUrl(remotePath, sign);
			var formData = new FormData();
			formData.append('op', 'move');
			formData.append('dest_fileid', destPath);
			formData.append('to_over_write', overWrite);

			$.ajax({
				type: 'POST',
				url: url,
				data: formData,
				processData: false,
				contentType: false,
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.getFolderList = function (success, error, bucketName, remotePath, num, context, order, pattern, prefix) {
		var that = this;

		remotePath = fixPath(remotePath, 'folder');

		that.listBase(success, error, bucketName, remotePath, num, context, order, pattern);
	};

	CosCloud.prototype.listBase = function (success, error, bucketName, remotePath, num, context, order, pattern, prefix) {
		var that = this;
		that.getAppSign(function (sign) {
			var url = that.getCgiUrl(remotePath, sign);

			num = num || 20;
			order = order || 0;
			pattern = pattern || 'eListBoth';

			var data = {
				op: "list",
				num: num,
				context: context,
				order: order,
				pattern: pattern
			};
			$.ajax({
				url: url,
				type: "GET",
				data: data,
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.uploadFile = function (success, error, onprogress, bucketName, remotePath, file, insertOnly) {
		var that = this;
		remotePath = fixPath(remotePath);
		if (file.size > MAX_UNSLICE_FILE_SIZE) {
			that.sliceUploadFile.apply(that, arguments);
			return;
		}
		that.getAppSign(function (sign) {
			var url = that.getCgiUrl(remotePath, sign);
			var formData = new FormData();
			formData.append('op', 'upload');
			formData.append('fileContent', file);
			if (insertOnly >= 0) {//insertOnly==0 表示允许覆盖文件 1表示不允许 其他值忽略
				formData.append('insertOnly', insertOnly);
			}
			$.ajax({
				type: 'POST',
				url: url,
				data: formData,
				processData: false,
				contentType: false,
				xhr: function () {

					var xhr = $.ajaxSettings.xhr();
					xhr.upload.onprogress = function (evt) {
						var percent = evt.loaded / evt.total;
						if (typeof onprogress == 'function') {
							onprogress(percent);
						}
					};

					return xhr;

				},
				success: success,
				error: error
			});
		});
	};

	CosCloud.prototype.sliceUploadFile = function (success, error, onprogress, bucketName, remotePath, file, insertOnly, optSliceSize, bizAttr) {

		var that = this;
		remotePath = fixPath(remotePath);
		that.getAppSign(function (sign) {
			var opt = {};
			optSliceSize = that.getSliceSize(optSliceSize);
			opt.onprogress = onprogress;
			opt.bucket = bucketName;
			opt.path = remotePath;
			opt.file = file;
			opt.insertOnly = insertOnly;
			opt.sliceSize = optSliceSize || 1024 * 1024;//分片不设置的话固定1M大小
			opt.appid = that.appid;
			opt.sign = sign;
			opt.biz_attr = bizAttr || '';


			//先查看是否有上传过分片
			sliceList.call(that, opt).always(function (res) {
				res = res || {};
				var data = res.data;
				if (data && data.session) {//之前上传过，直接开始上传剩下的分片
					opt.session = data.session;

					var listparts = opt.listparts;
					if (listparts && listparts.length) {
						opt.listparts = listparts;
						var len = listparts.length;
						opt.offset = listparts[len - 1].offset;
					}
					getSliceSHA1.call(that, opt).done(function (uploadparts) {

						opt.uploadparts = uploadparts;
						var len = uploadparts.length;
						opt.sha = uploadparts[len - 1].datasha;

						sliceUpload.call(that, opt).done(function () {

							sliceFinish.call(that, opt).done(function (r) {

								success(r);

							}).fail(function (d) {
								error({
									code: -1,
									message: d.message || 'slice finish error'
								});
							});

						}).fail(function (d) {
							error({
								code: -1,
								message: d.message || 'slice upload file error'
							});
						});
					}).fail(function () {
						error({
							code: -1,
							message: 'get slice sha1 error'
						});
					});

				} else if (data && data.access_url) {//之前已经上传完成
					if (typeof opt.onprogress == 'function') {
						opt.onprogress(1);
					}
					success(res);
				} else {//之前没上传，进行sliceInit开启上传
					getSliceSHA1.call(that, opt).done(function (uploadparts) {

						opt.uploadparts = uploadparts;
						var len = uploadparts.length;
						opt.sha = uploadparts[len - 1].datasha;

						sliceInit.call(that, opt).done(function (res) {

							res = res || {};
							var data = res.data || {};

							if (data && data.access_url) {//之前已经上传完成
								if (typeof opt.onprogress == 'function') {
									opt.onprogress(1);
								}
								success(res);
							} else {
								sliceFinish.call(that, opt).done(function (r) {

									success(r);

								}).fail(function (d) {
									error({
										code: -1,
										message: d.message || 'slice finish error'
									});
								});
							}


						}).fail(function (d) {
							d = d || {};
							error({
								code: d.code || -1,
								message: d.message || 'upload slice file error'
							});
						});
					}).fail(function () {
						error({
							code: -1,
							message: 'get slice sha1 error'
						});
					});
				}
			});


		});


	};

	//处理路径
	function fixPath(path, type) {

		if (!path) {
			return '';
		}
		var self = this;
		path = path.replace(/(^\/*)|(\/*$)/g, '');
		if (type == 'folder') {
			path = encodeURIComponent(path + '/').replace(/%2F/g, '/');
		} else {
			path = encodeURIComponent(path).replace(/%2F/g, '/');
		}

		if (self) {
			self.path = '/' + self.appid + '/' + self.bucket + '/' + path;
		}

		return path;
	}

	//获取分片sha1值数组
	function getSliceSHA1(opt) {
		var defer = $.Deferred();

		var sha1Algo = new window.jsSHA('SHA-1', 'BYTES');
		var read = 0;
		var unit = opt.sliceSize;
		var reader = new FileReader();
		var uploadparts = [];
		var file = opt.file;

		//为了避免内存可能过大，尝试分块读取文件并计算
		reader.readAsBinaryString(file.slice(read, read + unit));
		reader.onload = function (e) {

			if (file == null || file.length < 1) {
				return;
			}

			var middle = sha1Algo.update(e.target.result);

			var len = unit;
			if (len + read >= file.size) {
				len = file.size - read;
			} else {
				uploadparts.push({
					offset: read,
					datalen: len,
					datasha: middle
				});
			}

			read += unit;
			if (read < file.size) {

				var end = read + unit;
				if (end > file.size) {
					end = file.size;
				}
				//循环读文件
				reader.readAsBinaryString(file.slice(read, end));

			} else {
				//读完了计算全文sha1
				var sha1 = sha1Algo.getHash('HEX');

				uploadparts.push({
					offset: read - unit,
					datalen: len,
					datasha: sha1
				});

				defer.resolve(uploadparts);

			}


		};

		reader.onerror = function () {
			defer.reject();
		};


		return defer.promise();
	}

	//slice upload init
	function sliceInit(opt) {
		var defer = $.Deferred();
		var file = opt.file;
		var that = this;

		var url = this.getCgiUrl(opt.path, opt.sign);

		var formData = new FormData();
		var uploadparts = opt.uploadparts;
		formData.append('uploadparts', JSON.stringify(uploadparts));
		formData.append('sha', opt.sha);
		formData.append('op', 'upload_slice_init');
		formData.append('filesize', file.size);
		formData.append('slice_size', opt.sliceSize);
		formData.append('biz_attr', opt.biz_attr);
		formData.append('insertOnly', opt.insertOnly);


		$.ajax({
			type: 'POST',
			dataType: "JSON",
			url: url,
			data: formData,
			success: function (res) {
				res = res || {};
				if (res.code == 0) {

					if (res.data.access_url) {//如果秒传命中则直接返回
						defer.resolve(res);
						return;
					}
					var session = res.data.session;
					var sliceSize = parseInt(res.data.slice_size);

					var offset = res.data.offset || 0;

					opt.session = session;
					opt.slice_size = sliceSize;
					opt.offset = offset;


					sliceUpload.call(that, opt).done(function (r) {
						defer.resolve(r);
					}).fail(function (r) {
						defer.reject(r);
					});

				} else {
					defer.reject(res);
				}

			},
			error: function () {
				defer.reject();
			},
			processData: false,
			contentType: false
		});

		return defer.promise();
	}


	//分片上传正式接口
	function sliceUpload(opt) {
		var that = this;
		var defer = $.Deferred();


		var formData = new FormData();
		var file = opt.file;

		var offset = opt.offset || 0;
		var slice_size = opt.slice_size;
		var session = opt.session;
		var totalSize = file.size;

		var targetOffset = offset + slice_size;

		formData.append('sliceSize', slice_size);
		formData.append('op', 'upload_slice_data');
		formData.append('session', session);
		formData.append('offset', offset);
		if (opt.sha) {
			formData.append('sha', opt.sha);
		}
		formData.append('fileContent', that.slice.call(file, offset, targetOffset));

		that.getAppSign(function (sign) {
			opt.sign = sign;
			var url = that.getCgiUrl(opt.path, opt.sign);

			$.ajax({
				type: 'POST',
				dataType: "JSON",
				url: url,
				data: formData,
				xhr: function () {

					var xhr = $.ajaxSettings.xhr();
					xhr.upload.onprogress = function (evt) {
						var percent = (offset + evt.loaded) / file.size;
						if (percent > 1) {
							percent = 1;
						}
						if (typeof opt.onprogress == 'function') {
							opt.onprogress(percent);
						}
					};

					return xhr;

				},
				success: function (res) {
					res = res || {};
					if (res.code == 0) {

						var offset = res.data.offset + slice_size;

						if (offset < totalSize) {
							opt.offset = offset;
							sliceUpload.call(that, opt).done(function (r) {
								defer.resolve(r);
							}).fail(function () {
								defer.reject();
							});
						} else {
							if (typeof opt.onprogress == 'function') {
								opt.onprogress(1);
							}
							defer.resolve(res);
						}


					} else {
						defer.reject(res);
					}

				},
				error: function () {
					defer.reject();
				},
				processData: false,
				contentType: false
			});
		});


		return defer.promise();
	}

	//分片上传LIST接口
	function sliceList(opt) {
		var that = this;
		var defer = $.Deferred();

		var file = opt.file;

		that.getAppSign(function (sign) {

			opt.sign = sign;
			var url = that.getCgiUrl(opt.path, opt.sign);

			var formData = new FormData();
			formData.append('op', 'upload_slice_list');

			$.ajax({
				type: 'POST',
				dataType: "JSON",
				url: url,
				data: formData,
				success: function (res) {
					res = res || {};
					if (res.code == 0) {
						opt.session = res.data.session;
						opt.slice_size = res.data.slice_size;
						var listparts = res.data.listparts || [];

						opt.listparts = listparts;
						var len = listparts.length;
						if (len) {
							var lastPart = opt.listparts[len - 1];
							var last_offset = lastPart.offset;
							if (last_offset + opt.slice_size >= file.size) {
								defer.resolve();
								return defer.promise();
							}
							opt.offset = last_offset;
						}

						defer.resolve(res);
					} else {
						defer.reject(res);
					}

				},
				error: function () {
					defer.reject();
				},
				processData: false,
				contentType: false
			});


		});


		return defer.promise();
	}

	//结束分片上传
	function sliceFinish(opt) {
		var that = this;
		var defer = $.Deferred();
		var file = opt.file;

		that.getAppSign(function (sign) {

			opt.sign = sign;
			var session = opt.session;

			var url = that.getCgiUrl(opt.path, opt.sign);

			var formData = new FormData();
			if (opt.sha) {
				formData.append('sha', opt.sha);
			}
			formData.append('op', 'upload_slice_finish');
			formData.append('filesize', file.size);
			formData.append('session', session);

			$.ajax({
				type: 'POST',
				dataType: "JSON",
				url: url,
				data: formData,
				success: function (res) {
					res = res || {};
					if (res.code == 0) {
						defer.resolve(res);
					} else {
						defer.reject(res);
					}

				},
				error: function () {
					defer.reject();
				},
				processData: false,
				contentType: false
			});

		});


		return defer.promise();
	}


	return CosCloud;


}));