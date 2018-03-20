(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && (define.amd || define.cmd) ? define(factory) :
            global.CosCloud = factory();
}(this, function () {
    'use strict';

    // var $ = jQuery.noConflict(true);

    function CosCloud(opt) {
        this.appid = opt.appid;
        this.bucket = opt.bucket;
        this.region = opt.region;

        this.sha1CacheExpired = 3 * 24 * 3600;
        this.uploadMaxThread = 5;
        this.uploadMaxRetryTimes = 3;

        this._uploadingThreadCount = 0;
        this.tasks = [];

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
                if (decodeURIComponent(s) === s) {
                    s = encodeURIComponent(s);
                }
                callback(s);
            });
        };
    }

    //512K
    var SLICE_SIZE_512K = 1024 * 512;
    //1M
    var SLICE_SIZE_1M = 1024 * 1024;
    //2M
    var SLICE_SIZE_2M = 1024 * 1024 * 2;
    //3M
    var SLICE_SIZE_3M = 1024 * 1024 * 3;
    //20M 大于20M的文件需要进行分片传输
    var MAX_UNSLICE_FILE_SIZE = 1024 * 1024 * 20;

    CosCloud.version = '__VERSION__';
    CosCloud.prototype.cosapi_cgi_url = (location.protocol === 'https:' ? 'https:' : 'http:') + "//REGION.file.myqcloud.com/files/v2/";
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
            //authority    权限类型，可选参数，可选值为eInvalid,eWRPrivate,eWPrivateRPublic
            //            文件可以与bucket拥有不同的权限类型，已经设置过权限的文件如果想要撤销，直接赋值为eInvalid，则会采用bucket的权限
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

    CosCloud.prototype.uploadFile = function (success, error, onprogress, bucketName, remotePath, file, insertOnly, taskReady) {

        var that = this;
        if (file.size > MAX_UNSLICE_FILE_SIZE) {
            that.sliceUploadFile(success, error, onprogress, bucketName, remotePath, file, insertOnly, undefined, undefined, taskReady);
            return;
        }

        if (remotePath.substr(remotePath.length - 1) === '/') {
            error({code: -1, message: 'path not allow end with "/"'});
            return;
        }
        remotePath = fixPath(remotePath);

        // 辅助 cancelTask
        var taskId = guid();
        var $xhr;
        var globalTask = {
            id: taskId,
            state: 'uploading',
            cancel: function () {
                $xhr && $xhr.abort();
            }
        };
        this.tasks[taskId] = globalTask;
        taskReady && typeof taskReady === 'function' && taskReady(taskId);

        that.getAppSign(function (sign) {
            var url = that.getCgiUrl(remotePath, sign);
            var formData = new FormData();
            insertOnly = insertOnly === 0 ? 0 : 1;
            formData.append('op', 'upload');
            formData.append('fileContent', file);
            formData.append('insertOnly', insertOnly);
            $xhr = $.ajax({
                type: 'POST',
                url: url,
                data: formData,
                processData: false,
                contentType: false,
                xhr: function () {

                    var xhr = $.ajaxSettings.xhr();
                    xhr.upload.onprogress = function (evt) {
                        var percent = evt.loaded / evt.total;
                        if (typeof onprogress === 'function') {
                            onprogress(percent, 0);
                        }
                    };

                    return xhr;

                },
                success: function () {
                    if (globalTask.state === 'cancel') return;
                    success.apply(this, arguments);
                },
                error: function () {
                    if (globalTask.state === 'cancel') return;
                    success.apply(this, arguments);
                }
            });
        });
    };

    CosCloud.prototype.sliceUploadFile = function (success, error, onprogress, bucketName, remotePath, file, insertOnly, optSliceSize, bizAttr, taskReady) {

        if (remotePath.substr(remotePath.length - 1) === '/') {
            error({code: -1, message: 'path not allow end with "/"'});
            return;
        }

        // 辅助 cancelTask
        var taskId = guid();
        var globalTask = {
            id: taskId,
            state: 'uploading',
            cancelRequests: null,
            cancel: function () {
                globalTask.cancelRequests && globalTask.cancelRequests();
            },
        };
        this.tasks[taskId] = globalTask;
        taskReady && typeof taskReady === 'function' && taskReady(taskId);

        var that = this;
        remotePath = fixPath(remotePath);
        that.getAppSign(function (sign) {
            var opt = {};
            opt.globalTask = globalTask;
            if (opt.globalTask.state === 'cancel') return;
            optSliceSize = that.getSliceSize(optSliceSize);
            opt.bucket = bucketName;
            opt.path = remotePath;
            opt.file = file;
            opt.insertOnly = insertOnly === 0 ? 0 : 1;
            opt.sliceSize = optSliceSize || 1024 * 1024;//分片不设置的话固定1M大小
            opt.appid = that.appid;
            opt.sign = sign;
            opt.biz_attr = bizAttr || '';
            opt.onprogress = function (uploaded, sha1Check) {
                if (sha1Check === undefined) sha1Check = 1;
                onprogress(uploaded, sha1Check);
            };

            //先查看是否有上传过分片
            sliceList.call(that, opt).always(function (res) {
                if (opt.globalTask.state === 'cancel') return;

                res = res || {};
                var data = res.data;
                if (data && data.session) { // 之前上传过，直接开始上传剩下的分片
                    if (data.filesize !== opt.file.size) {
                        return error({code: -1, message: 'filesize not match'});
                    }

                    var listparts = opt.listparts || [];
                    opt.session = data.session;
                    opt.listparts = listparts;
                    if (listparts && listparts.length) {
                        var len = listparts.length;
                        opt.offset = listparts[len - 1].offset;
                    }
                    if (data.sha) {
                        opt.onlineSha = data.sha.split('_')[0];
                    }
                    getSliceSHA1.call(that, opt).done(function (uploadparts) {
                        if (opt.globalTask.state === 'cancel') return;

                        opt.uploadparts = uploadparts;
                        var len = uploadparts.length;
                        opt.sha = uploadparts[len - 1].datasha;

                        sliceUpload.call(that, opt).done(function () {
                            sliceFinish.call(that, opt).done(function (r) {
                                success(r);
                            }).fail(function (d) {
                                error({code: -1, message: d && d.message || 'slice finish error'});
                            });
                        }).fail(function (d) {
                            error({code: -1, message: (d && d.message) || 'slice upload file error'});
                        });

                    }).fail(function (errMsg) {
                        error({code: -1, message: errMsg || 'get slice sha1 error'});
                    });
                } else if (data && data.access_url && insertOnly !== 0) { // 已存在文件，并且不允许覆盖
                    // insertOnly === 0 表示覆盖文件，否则不覆盖
                    if (typeof opt.onprogress === 'function') {
                        opt.onprogress(1, 0);
                    }
                    success(res);
                } else { // 之前没上传，进行sliceInit开启上传
                    getSliceSHA1.call(that, opt).done(function (uploadparts) {
                        if (opt.globalTask.state === 'cancel') return;

                        opt.uploadparts = uploadparts;
                        var len = uploadparts.length;
                        opt.sha = uploadparts[len - 1].datasha;

                        sliceInit.call(that, opt).done(function (res) {
                            if (opt.globalTask.state === 'cancel') return;

                            res = res || {};
                            var data = res.data || {};

                            if (data && data.access_url) { // 之前已经上传完成
                                if (typeof opt.onprogress === 'function') {
                                    opt.onprogress(1, 0);
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

    CosCloud.prototype.cancelTask = function (taskId) {
        var task = this.tasks[taskId];
        if (task) {
            task.state = 'cancel';
            task.cancel();
        }
    };

    // 获取唯一 id
    function guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }

    //处理路径
    function fixPath(path, type) {

        if (!path) {
            return '';
        }
        var self = this;
        path = path.replace(/(^\/*)/g, '');
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

    var REM_SHA1_KEY = '_cos_sdk_sha1_';
    var rememberSha1 = function (session, sha1Samples, sha1CacheExpired) {
        try {
            var data = JSON.parse(localStorage.getItem(REM_SHA1_KEY)) || {};
        } catch (e) {
        }
        var current = Date.now();
        sha1Samples['update_time'] = current;
        data[session] = sha1Samples;
        // 删除太旧的数据
        for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);
            var item = localStorage.getItem(key);
            if (current - item['update_time'] > sha1CacheExpired) {
                localStorage.removeItem(key)
            }
        }
        localStorage.setItem(REM_SHA1_KEY, JSON.stringify(data));
    };
    var restoreSha1 = function (session) {
        try {
            var data = JSON.parse(localStorage.getItem(REM_SHA1_KEY)) || {};
        } catch (e) {
        }
        return data[session];
    };

    //获取分片sha1值数组
    function getSliceSHA1(opt) {
        var defer = $.Deferred();

        var sha1Algo = new jsSHA('SHA-1', 'BYTES');
        var read = 0;
        var unit = opt.sliceSize;
        var reader = new FileReader();
        var uploadParts = [];
        var file = opt.file;
        var fileSize = file.size;

        // 获取已存在的 session sha1 抽样
        var sha1Samples;
        if (opt.session) {
            sha1Samples = restoreSha1(opt.session);
        }

        var pushPartAndCheck = function (part) {
            uploadParts.push(part);
            // 判读是否和已存在的文件不一致，如果不一致马上结束计算
            var sha1Index = part.offset + '-' + part.datalen;
            if (sha1Samples && sha1Samples[sha1Index]) {
                if (part.datasha !== sha1Samples[sha1Index]) {
                    return false;
                }
            }
            return true;
        };

        //为了避免内存可能过大，尝试分块读取文件并计算
        reader.onload = function (e) {
            if (opt.globalTask.state === 'cancel') return;
            if (!file || file.length < 1) return;

            // 计算当次分块的 sha1 值
            var middle = sha1Algo.update(this.content || this.result);

            // 获取当前分块的长度
            var len = read + unit > fileSize ? fileSize - read : unit;
            var notEnd = read + len < fileSize;
            var sha1 = notEnd ? middle : sha1Algo.getHash('HEX'); // 最后一块特殊处理

            // 保存每次计算得到的 sha1
            if (!pushPartAndCheck({offset: read, datalen: len, datasha: sha1})) {
                defer.reject('sha1 not match');
                return;
            }

            // 更新已完成百分比
            read = read + len;
            opt.onprogress(0, read / fileSize);

            // 循环读文件，到最后一块处理完之后，回调所有分片数据
            if (notEnd) {
                readAsBinStr.call(reader, file.slice(read, Math.min(read + unit, fileSize)));
            } else {
                defer.resolve(uploadParts);
            }
        };
        readAsBinStr.call(reader, file.slice(read, read + unit));

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
                if (opt.globalTask.state === 'cancel') return;
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

                    // 保存正在上传的 session 文件分片 sha1，用于下一次续传优化判断是否不一样的文件
                    var sItem, sha1Samples = {};
                    for (var i = 1; i < opt.uploadparts.length; i *= 2) {
                        sItem = opt.uploadparts[i - 1];
                        sha1Samples[sItem.offset + '-' + sItem.datalen] = sItem.datasha;
                    }
                    sItem = opt.uploadparts[opt.uploadparts.length - 1];
                    sha1Samples[sItem.offset + '-' + sItem.datalen] = sItem.datasha;
                    rememberSha1(opt.session, sha1Samples, that.sha1CacheExpired);

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


    // 上传单个分片，分片失败重传 3 次
    var uploadSingleChunk = function (task, chunk, callback) {
        var that = this;
        var formData = new FormData();
        var opt = task.opt;
        var file = opt.file;
        var slice_size = opt.slice_size;
        var session = opt.session;
        var totalSize = file.size;
        var offsetStart = chunk.start;
        var offsetEnd = Math.min(offsetStart + slice_size, totalSize);
        var blob = that.slice.call(file, offsetStart, offsetEnd);
        var chunkSize = blob.size;

        var removeXhr = function (xhr) {
            for (var i = task.uploadingAjax.length - 1; i >= 0; i--) {
                if (xhr === task.uploadingAjax[i]) {
                    task.uploadingAjax.splice(i, 1);
                }
            }
        };
        var preLoaded = 0;
        var updateProgress = function (loaded, immediately) {
            task.loadedSize += loaded - preLoaded;
            preLoaded = loaded;
            task.onTaskProgress && task.onTaskProgress(immediately);
        };
        var uploadChunk = function (cb) {
            formData.append('sliceSize', slice_size);
            formData.append('op', 'upload_slice_data');
            formData.append('session', session);
            formData.append('offset', offsetStart);
            opt.sha && formData.append('sha', opt.sha);
            formData.append('fileContent', blob);

            that.getAppSign(function (sign) {
                opt.sign = sign;
                var url = that.getCgiUrl(opt.path, opt.sign);

                var ajax = $.ajax({
                    type: 'POST',
                    dataType: "JSON",
                    url: url,
                    data: formData,
                    xhr: function () {
                        var xhr = $.ajaxSettings.xhr();
                        xhr.upload.onprogress = function (evt) {
                            updateProgress(evt.loaded);
                            task.onTaskProgress && task.onTaskProgress();
                        };
                        return xhr;
                    },
                    success: function (res) {
                        updateProgress(chunkSize, true);
                        res = res || {};
                        if (res.code === 0) {
                            cb(null, res);
                        } else {
                            cb('error', res);
                        }
                    },
                    error: function () {
                        updateProgress(0, true);
                        cb('error');
                    },
                    complete: function () {
                        removeXhr(ajax);
                    },
                    processData: false,
                    contentType: false
                });
                task.uploadingAjax.push(ajax);
            });
        };

        // 失败重试 3 次
        var tryUpload = function (times) {
            if (opt.globalTask.state === 'cancel') return;
            uploadChunk(function (err, data) {
                if (err) { // fail, retry
                    if (times >= that.uploadMaxRetryTimes || task.uploadError || opt.globalTask.state === 'cancel') {
                        callback(err, data);
                    } else {
                        tryUpload(times + 1);
                    }
                } else { // success
                    callback(err, data);
                }
            });
        };
        tryUpload(1);

    };


    // 分片上传单个文件
    function sliceUpload(opt) {

        var that = this;
        var file = opt.file;
        var defer = $.Deferred();

        // 整理参数
        var progressTimer;
        var task = {
            opt: opt,
            uploadingAjax: [],
            uploadingCount: 0,
            currentIndex: 0,
            chunkCount: Math.ceil(file.size / opt.slice_size),
            chunks: [],
            loadedSize: 0,
            uploadError: false,
            onTaskProgress: function (immediately) {
                var progress = function () {
                    progressTimer = 0;
                    opt.onprogress && opt.onprogress(task.loadedSize / file.size, 1);
                };
                if (immediately) {
                    clearTimeout(progressTimer);
                    progress();
                } else {
                    if (progressTimer) return;
                    progressTimer = setTimeout(progress, 100);
                }
            }
        };

        // 整理所有分片数据
        (function (){
            var i, partMap = {};
            if (opt.listparts) {
                for (i = 0; i < opt.listparts.length; i++) {
                    partMap[opt.listparts[i].offset] = opt.listparts[i];
                }
            }
            for (i = 0; i < task.chunkCount; i++) {
                var start = i * opt.slice_size;
                var end = Math.min(start + opt.slice_size, file.size);
                var chunk = {
                    start: start,
                    end: end,
                    size: end - start
                };
                if (partMap[start]) {
                    task.loadedSize += chunk.size;
                    chunk.state = 'online';
                } else {
                    chunk.state = 'waiting';
                }
                task.chunks.push(chunk);
            }
        })();

        // 所有分片上传完成，发起回调
        var uploadSuccess = function () {
            task.onTaskProgress(true);
            defer.resolve();
        };

        // 出错的时候，结束所有上传，发起回调
        var uploadError = function (error, res) {
            task.uploadError = 'error';
            for (var i = task.uploadingAjax.length - 1; i >= 0; i--) {
                var ajax = task.uploadingAjax[i];
                ajax && ajax.abort();
            }
            task.onTaskProgress(true);
            defer.reject(res);
        };

        opt.globalTask.cancelRequests = function () {
            for (var i = task.uploadingAjax.length - 1; i >= 0; i--) {
                var ajax = task.uploadingAjax[i];
                ajax && ajax.abort();
            }
        };

        // 开始上传并发上传，同一个上传实例里共用线程数限制
        var uploadNextChunk = function () {
            if (opt.globalTask.state === 'cancel') return;
            for (; that._uploadingThreadCount < that.uploadMaxThread && task.currentIndex < task.chunkCount; task.currentIndex++) {
                var chunk = task.chunks[task.currentIndex];
                if (chunk.state !== 'waiting') continue;
                (function (chunk) {
                    chunk.state = 'uploading';
                    task.uploadingCount++;
                    that._uploadingThreadCount++;
                    uploadSingleChunk.call(that, task, chunk, function (error, data) {
                        task.uploadingCount--;
                        that._uploadingThreadCount--;
                        if (error) { // 错误马上结束
                            chunk.state = 'error';
                            uploadError(error, data);
                        } else {
                            chunk.state = 'success';
                            if (task.uploadingCount <= 0 && task.currentIndex >= task.chunkCount) { // 全部完成
                                uploadSuccess();
                            } else { // 未完成，处理执行下一个分片
                                uploadNextChunk();
                            }
                        }
                    });
                })(chunk);
            }
            if (task.uploadingCount === 0 && task.currentIndex === task.chunks.length) { // 全部不需要上传
                uploadSuccess();
            }
        };
        uploadNextChunk();

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
                            if (last_offset + lastPart.datalen > file.size) {
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

    function readAsBinStr(fileData) {
        var readFun;
        if (FileReader.prototype.readAsBinaryString) {
            readFun = FileReader.prototype.readAsBinaryString;
        } else if (FileReader.prototype.readAsArrayBuffer) { // 在 ie11 添加 readAsBinaryString 兼容
            readFun = function (fileData) {
                var binary = "";
                var pt = this;
                var reader = new FileReader();
                reader.onload = function (e) {
                    var bytes = new Uint8Array(reader.result);
                    var length = bytes.byteLength;
                    for (var i = 0; i < length; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    //pt.result  - readonly so assign binary
                    pt.content = binary;
                    pt.onload();
                };
                reader.readAsArrayBuffer(fileData);
            };
        } else {
            console.error('FileReader not support readAsBinaryString');
        }
        readFun.call(this, fileData);
    }

    return CosCloud;

}));