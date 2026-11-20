#[allow(unused_imports)]
use pyo3::prelude::*;
use rnet_tapo::PowerStripPlugHandler;
use rnet_tapo::responses::PowerStripPlugResult;

py_child_handler! {
    PyPowerStripPlugHandler(PowerStripPlugHandler, PowerStripPlugResult),
    py_name = "PowerStripPlugHandler",
    on_off,
}
