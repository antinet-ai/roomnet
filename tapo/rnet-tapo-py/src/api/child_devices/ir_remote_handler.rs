use std::ops::Deref;

use pyo3::prelude::*;
use rnet_tapo::IrRemoteHandler;
use rnet_tapo::responses::IrRemoteResult;

use crate::call_handler_method;

py_child_handler! {
    PyIrRemoteHandler(IrRemoteHandler, IrRemoteResult),
    py_name = "IrRemoteHandler",
}

#[pymethods]
impl PyIrRemoteHandler {
    pub async fn send_key_by_name(&self, key_name: String) -> PyResult<()> {
        let handler = self.inner.clone();
        call_handler_method!(handler.deref(), IrRemoteHandler::send_key_by_name, key_name)
    }
}
