//! The checks that tests make on what the library returns from a simulated
//! device.

use rnet_tapo::TapoResponseError;

/// Asserts that `result` failed with the device error `code`, of the `kind`
/// that the library names it.
pub fn assert_device_error<T>(result: Result<T, rnet_tapo::Error>, code: i64, kind: &str) {
    let Err(error) = result else {
        panic!("the request succeeded");
    };

    assert!(
        matches!(
            &error,
            rnet_tapo::Error::Tapo(TapoResponseError::DeviceError { code: actual_code, kind: actual_kind })
                if *actual_code == code && *actual_kind == kind
        ),
        "{error:?}"
    );
}

/// Asserts that `login` failed as unauthorized, with the error `kind`.
pub fn assert_unauthorized<T>(login: Result<T, rnet_tapo::Error>, kind: &str) {
    let Err(error) = login else {
        panic!("the login succeeded");
    };

    assert!(
        matches!(
            &error,
            rnet_tapo::Error::Tapo(TapoResponseError::Unauthorized { kind: actual, .. }) if *actual == kind
        ),
        "{error:?}"
    );
}
