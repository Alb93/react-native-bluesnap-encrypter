import React, {PureComponent} from "react";
import PropTypes from "prop-types";
import {Image, View, StyleSheet} from "react-native";
import {WebView} from 'react-native-webview';

const validTypes = ["encrypt"];
const requests = {};
const guid = () => Math.random().toString(36).slice(2);
const createAction = (type, data) => ({
    _id: guid(),
    type,
    data
});
const createRequest = (action) => {
    return new Promise((resolve, reject) => {
        requests[action._id] = {
            resolve, reject, action
        }
    });
};
const styles = StyleSheet.create({
    container: {
        width: 0,
        height: 0,
        display: "none"
    }
});

export default class BlueSnapEncrypter extends PureComponent {
    constructor(props, context) {
        super(props, context);

        this.webView = null;
        this.setWebViewRef = this.setWebViewRef.bind(this);
        this.encrypt = this.encrypt.bind(this);
        this.onEncrypt = this.onEncrypt.bind(this);
        this.onMessage = this.onMessage.bind(this);
    }

    setWebViewRef(webView) {
        this.webView = webView;
    }

    getInjectedJavaScript() {
        const {bluesnapVersion, clientEncryptionKey, fraudSessionId} = this.props;

        return `
        window.initialize = (function () {
            var queue = [];
            var loaded = false;
            var bluesnap = null;
            var formId = "bluesnap";
            var BS_CREDIT_CARD_KEY = "encryptedCreditCard";
            var BS_CVV_KEY = "encryptedCvv";

            function createHiddenInput(bluesnapName, value) {
                var $input = document.createElement("input");
                $input.setAttribute("type", "hidden");
                $input.setAttribute("data-bluesnap", bluesnapName);
                $input.value = value;

                return $input;
            }

            function createForm(params) {
                var $form = document.createElement("form");
                var $creditCardNumber = createHiddenInput(BS_CREDIT_CARD_KEY, params.creditCardNumber);
                var $cvvNumber = createHiddenInput(BS_CVV_KEY, params.cvvNumber);

                $form.id = formId;

                $form.appendChild($creditCardNumber);
                $form.appendChild($cvvNumber);

                document.body.appendChild($form);
            }

            function encrypt(action) {
                createForm(action.data);

                bluesnap.encrypt(formId);

                var ccLast4Digits = document.querySelector("input[name='ccLast4Digits']").value;
                var encryptedCreditCard = document.querySelector("input[name='" + BS_CREDIT_CARD_KEY + "']").value;
                var encryptedCvv = document.querySelector("input[name='" + BS_CVV_KEY + "']").value;

                var $form = document.querySelector("#" + formId);
                $form.parentNode.removeChild($form);

                window.ReactNativeWebView.postMessage(JSON.stringify({
                    _id: action._id,
                    type: "encrypt",
                    data: {
                        ccLast4Digits: ccLast4Digits,
                        encryptedCreditCard: encryptedCreditCard,
                        encryptedCvv: encryptedCvv
                    }
                }));
            }

            function createEmbedFraudSessionUrl(fraudSessionId, type /* htm || gif */) {
                return "https://www.bluesnap.com/servlet/logo." + type + "?s=" + fraudSessionId;
            }

            function setFraudSession(fraudSessionId) {
                var img = document.createElement("img");

                img.src = createEmbedFraudSessionUrl(fraudSessionId, "gif");

                document.body.appendChild(img);
            }

            function handleAction(action) {

                switch (action.type) {
                    case "encrypt":
                        encrypt(action);
                        break;
                }
            }

            function onMessage(e) {
                try {
                    var action = JSON.parse(e.data);
                    if (!action.type) {
                        return;
                    }

                    if (!loaded) {
                        queue.push(action);
                        return;
                    }

                    handleAction(action);

                } catch (e) {
                }
            }

            document.addEventListener("message", onMessage, "*");
            window.addEventListener("message", onMessage, "*");

            return function (clientEncryptionKey, version, fraudSessionId) {
                var script = document.createElement("script");
                script.src = "https://gateway.bluesnap.com/js/cse/v" + version + "/bluesnap.js"
                script.onload = function () {
                    bluesnap = new BlueSnap(clientEncryptionKey);
                    var queueLength = queue.length;
                    if (queueLength > 0) {
                        for (var i = 0; i < queueLength; i++) {
                            handleAction(queue[i]);
                        }

                        queue.length = 0;
                    }
                    loaded = true;

                    if (fraudSessionId) {
                        setFraudSession(fraudSessionId);
                    }
                };
                document.head.appendChild(script);
            }
        })();
        window.initialize("${clientEncryptionKey}", "${bluesnapVersion}", "${fraudSessionId}");
        true;`;
    }

    onEncrypt(action) {
        const request = requests[action._id];

        if (request) {
            request.resolve(action.data);
            delete requests[action._id];
        }
    }

    onMessage(event) {
        try {
            console.log('On message received', event.nativeEvent.data);
            const action = JSON.parse(event.nativeEvent.data);

            if (!action.type || !validTypes.includes(action.type)) {
                return;
            }

            switch (action.type) {
                case "encrypt":
                    this.onEncrypt(action);
                    break;
            }
        } catch (e) {
            console.log(e);
        }
    }

    encrypt(data) {
        console.log('Encrypt called');
        if (this.webView) {
            console.log('Encrypt called 1');
            const action = createAction("encrypt", data);
            console.log('action', action);
            const strAction = JSON.stringify(action);
            console.log('strAction', strAction);
            this.webView.injectJavaScript(
                `
                window.postMessage('${strAction}', "*");
                true;
                `
            );
            return createRequest(action);
        }
    }

    render() {
        return (
            <View style={styles.container}>
                <WebView
                    style={{opacity: 0.00}}
                    ref={this.setWebViewRef}
                    onMessage={this.onMessage}
                    injectedJavaScript={this.getInjectedJavaScript()}
                    onError={syntheticEvent => {
                        const {nativeEvent} = syntheticEvent;
                        console.error('WebView error: ', nativeEvent);
                    }}
                    source={{uri: 'https://www.google.com'}}
                    onLoad={syntheticEvent => {
                        const {nativeEvent} = syntheticEvent;
                        console.log('Source loaded');
                    }}
                    javaScriptEnabled
                />
            </View>
        );
    }
}
BlueSnapEncrypter.propTypes = {
    clientEncryptionKey: PropTypes.string.isRequired,
    bluesnapVersion: PropTypes.string
};

BlueSnapEncrypter.defaultProps = {
    bluesnapVersion: "1.0.3",
    fraudSessionId: ""
};