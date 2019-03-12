/*
    上传视频
*/

import { objForEach, arrForEach, percentFormat } from '../../util/util.js'
import Progress from './progress.js'
import { UA } from '../../util/util.js'

// 构造函数
function UploadVideo(editor) {
    this.editor = editor
}

// 原型
UploadVideo.prototype = {
    constructor: UploadVideo,

    // 根据 debug 弹出不同的信息
    _alert: function (alertInfo, debugInfo) {
        const editor = this.editor
        const debug = editor.config.debug
        const customAlert = editor.config.customAlert

        if (debug) {
            throw new Error('wangEditor: ' + (debugInfo || alertInfo))
        } else {
            if (customAlert && typeof customAlert === 'function') {
                customAlert(alertInfo)
            } else {
                alert(alertInfo)
            }
        }
    },

    // 根据链接插入视频
    insertLinkVideo: function (link) {
        if (!link) {
            return
        }
        const editor = this.editor
        const config = editor.config

        // 校验格式
        const linkVideoCheck = config.linkVideoCheck
        let checkResult
        if (linkVideoCheck && typeof linkVideoCheck === 'function') {
            checkResult = linkVideoCheck(link)
            if (typeof checkResult === 'string') {
                // 校验失败，提示信息
                alert(checkResult)
                return
            }
        }

        editor.cmd.do('insertHTML', `<video src="${link}" style="max-width:100%;" controls="controls"/>`)

        // 验证视频 url 是否有效，无效的话给出提示
        let video = document.createElement('video')
        video.onload = () => {
            const callback = config.linkImgCallback
            if (callback && typeof callback === 'function') {
                callback(link)
            }

            video = null
        }
        video.onerror = () => {
            video = null
            // 无法成功下载视频
            this._alert('插入视频错误', `wangEditor: 插入视频出错，视频链接是 "${link}"，下载该链接失败`)
            return
        }
        video.onabort = () => {
            video = null
        }
        video.src = link
    },

    // 上传视频
    uploadVideo: function (files) {
        if (!files || !files.length) {
            return
        }

        // ------------------------------ 获取配置信息 ------------------------------
        const editor = this.editor
        const config = editor.config
        let uploadVideoServer = config.uploadVideoServer
        const uploadVideoShowBase64 = config.uploadVideoShowBase64

        const maxSize = config.uploadVideoMaxSize
        const maxSizeM = maxSize / 1024 / 1024
        const maxLength = config.uploadVideoMaxLength || 10000
        const uploadFileName = config.uploadFileName || ''
        const uploadVideoParams = config.uploadVideoParams || {}
        const uploadVideoParamsWithUrl = config.uploadVideoParamsWithUrl
        const uploadVideoHeaders = config.uploadVideoHeaders || {}
        const hooks = config.uploadVideoHooks || {}
        const timeout = config.uploadVideoTimeout || 3000
        let withCredentials = config.withCredentials
        if (withCredentials == null) {
            withCredentials = false
        }
        const customUploadVideo = config.customUploadVideo

        if (!customUploadVideo) {
            // 没有 customUploadVideo 的情况下，需要如下两个配置才能继续进行视频上传
            if (!uploadVideoServer && !uploadVideoShowBase64) {
                return
            }
        }

        // ------------------------------ 验证文件信息 ------------------------------
        const resultFiles = []
        let errInfo = []
        arrForEach(files, file => {
            var name = file.name
            var size = file.size

            // chrome 低版本 name === undefined
            if (!name || !size) {
                return
            }

            if (/\.(mp4|mpeg4|ogg)$/i.test(name) === false) {
                // 后缀名不合法，不是视频
                errInfo.push(`【${name}】不是视频`)
                return
            }
            if (maxSize < size) {
                // 上传视频过大
                errInfo.push(`【${name}】大于 ${maxSizeM}M`)
                return
            }

            // 验证通过的加入结果列表
            resultFiles.push(file)
        })
        // 抛出验证信息
        if (errInfo.length) {
            this._alert('视频验证未通过: \n' + errInfo.join('\n'))
            return
        }
        if (resultFiles.length > maxLength) {
            this._alert('一次最多上传' + maxLength + '张视频')
            return
        }

        // ------------------------------ 自定义上传 ------------------------------
        if (customUploadVideo && typeof customUploadVideo === 'function') {
            customUploadVideo(resultFiles, this.insertLinkVideo.bind(this))

            // 阻止以下代码执行
            return
        }

        // 添加视频数据
        const formdata = new FormData()
        arrForEach(resultFiles, file => {
            const name = uploadFileName || file.name
            formdata.append(name, file)
        })

        // ------------------------------ 上传视频 ------------------------------
        if (uploadVideoServer && typeof uploadVideoServer === 'string') {
            // 添加参数
            const uploadVideoServerArr = uploadVideoServer.split('#')
            uploadVideoServer = uploadVideoServerArr[0]
            const uploadVideoServerHash = uploadVideoServerArr[1] || ''
            objForEach(uploadVideoParams, (key, val) => {
                // 因使用者反应，自定义参数不能默认 encode ，由 v3.1.1 版本开始注释掉
                // val = encodeURIComponent(val)

                // 第一，将参数拼接到 url 中
                if (uploadVideoParamsWithUrl) {
                    if (uploadVideoServer.indexOf('?') > 0) {
                        uploadVideoServer += '&'
                    } else {
                        uploadVideoServer += '?'
                    }
                    uploadVideoServer = uploadVideoServer + key + '=' + val
                }

                // 第二，将参数添加到 formdata 中
                formdata.append(key, val)
            })
            if (uploadVideoServerHash) {
                uploadVideoServer += '#' + uploadVideoServerHash
            }

            // 定义 xhr
            const xhr = new XMLHttpRequest()
            xhr.open('POST', uploadVideoServer)

            // 设置超时
            xhr.timeout = timeout
            xhr.ontimeout = () => {
                // hook - timeout
                if (hooks.timeout && typeof hooks.timeout === 'function') {
                    hooks.timeout(xhr, editor)
                }

                this._alert('上传视频超时')
            }

            // 监控 progress
            if (xhr.upload) {
                xhr.upload.onprogress = e => {
                    let percent
                    // 进度条
                    const progressBar = new Progress(editor)
                    if (e.lengthComputable) {
                        percent = e.loaded / e.total
                        progressBar.show(percent)
                    }
                }
            }

            // 返回数据
            xhr.onreadystatechange = () => {
                let result
                if (xhr.readyState === 4) {
                    if (xhr.status < 200 || xhr.status >= 300) {
                        // hook - error
                        if (hooks.error && typeof hooks.error === 'function') {
                            hooks.error(xhr, editor)
                        }

                        // xhr 返回状态错误
                        this._alert('上传视频发生错误', `上传视频发生错误，服务器返回状态是 ${xhr.status}`)
                        return
                    }

                    result = xhr.responseText
                    if (typeof result !== 'object') {
                        try {
                            result = JSON.parse(result)
                        } catch (ex) {
                            // hook - fail
                            if (hooks.fail && typeof hooks.fail === 'function') {
                                hooks.fail(xhr, editor, result)
                            }

                            this._alert('上传视频失败', '上传视频返回结果错误，返回结果是: ' + result)
                            return
                        }
                    }
                    if (!hooks.customInsert && result.errno != '0') {
                        // hook - fail
                        if (hooks.fail && typeof hooks.fail === 'function') {
                            hooks.fail(xhr, editor, result)
                        }

                        // 数据错误
                        this._alert('上传视频失败', '上传视频返回结果错误，返回结果 errno=' + result.errno)
                    } else {
                        if (hooks.customInsert && typeof hooks.customInsert === 'function') {
                            // 使用者自定义插入方法
                            hooks.customInsert(this.insertLinkVideo.bind(this), result, editor)
                        } else {
                            // 将视频插入编辑器
                            const data = result.data || []
                            data.forEach(link => {
                                this.insertLinkVideo(link)
                            })
                        }

                        // hook - success
                        if (hooks.success && typeof hooks.success === 'function') {
                            hooks.success(xhr, editor, result)
                        }
                    }
                }
            }

            // hook - before
            if (hooks.before && typeof hooks.before === 'function') {
                const beforeResult = hooks.before(xhr, editor, resultFiles)
                if (beforeResult && typeof beforeResult === 'object') {
                    if (beforeResult.prevent) {
                        // 如果返回的结果是 {prevent: true, msg: 'xxxx'} 则表示用户放弃上传
                        this._alert(beforeResult.msg)
                        return
                    }
                }
            }

            // 自定义 headers
            objForEach(uploadVideoHeaders, (key, val) => {
                xhr.setRequestHeader(key, val)
            })

            // 跨域传 cookie
            xhr.withCredentials = withCredentials

            // 发送请求
            xhr.send(formdata)

            // 注意，要 return 。不去操作接下来的 base64 显示方式
            return
        }

        // ------------------------------ 显示 base64 格式 ------------------------------
        if (uploadVideoShowBase64) {
            arrForEach(files, file => {
                const _this = this
                const reader = new FileReader()
                reader.readAsDataURL(file)
                reader.onload = function () {
                    _this.insertLinkVideo(this.result)
                }
            })
        }
    }
}

export default UploadVideo