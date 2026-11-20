//! Imports signed decision bundles (the inference runtime and the decision
//! models) into a site's model store. The service has no import route for
//! them yet, so this runs while the service is stopped, as an Engineer.
//!
//! usage: anet-home-import <site home> <vendor public-key.json> <bundle dir>...
//! The Engineer's name and password are read from ANET_HOME_ENGINEER and
//! ANET_HOME_ENGINEER_PASSWORD.

use anet_trust::{AccessConfig, AccessControl, Password};
use anet_trust::{
    BundleKind, ModelStore, RolePatterns, SecurityLog, SecurityLogConfig, SignerPublicKeys,
    TrustAnchor, TrustAnchors,
};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

const MAX_KEY_FILE_BYTES: u64 = 64 * 1024;

fn required_variable(name: &str) -> Result<String, String> {
    std::env::var(name).map_err(|_| format!("{name} is not set"))
}

fn run() -> Result<(), String> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let [home, vendor_key, bundles @ ..] = arguments.as_slice() else {
        return Err("usage: anet-home-import <site home> <vendor public-key.json> <bundle dir>...".into());
    };
    if bundles.is_empty() {
        return Err("name at least one bundle directory".into());
    }
    let home = PathBuf::from(home);
    let engineer = required_variable("ANET_HOME_ENGINEER")?;
    let password = required_variable("ANET_HOME_ENGINEER_PASSWORD")?;

    let log = SecurityLog::open(SecurityLogConfig::new(home.join("log")))
        .map_err(|error| format!("the security log: {error}"))?;
    let site_key = anet_access::site_key::read_site_key(&home.join("site.key"))
        .map_err(|error| format!("the site key: {error}"))?;
    let access = AccessControl::open(AccessConfig::new(
        home.join("access"),
        site_key,
        Arc::clone(&log),
    ))
    .map_err(|error| format!("the access store: {error}"))?;
    let key_bytes = anet_trust::protected_file::read_protected_file(
        std::path::Path::new(vendor_key),
        MAX_KEY_FILE_BYTES,
    )
    .map_err(|error| format!("the vendor key: {error}"))?;
    let keys = SignerPublicKeys::from_json(&key_bytes)
        .map_err(|error| format!("the vendor key: {error}"))?;
    let anchor = TrustAnchor::new("vendor", keys, [BundleKind::Base], RolePatterns::every_role())
        .map_err(|error| format!("the vendor anchor: {error}"))?;
    let anchors = TrustAnchors::new(vec![anchor]).map_err(|error| format!("anchors: {error}"))?;
    let store = ModelStore::new(home.join("models"), anchors, Arc::clone(&log), Arc::clone(&access))
        .map_err(|error| format!("the model store: {error}"))?;
    let session = access
        .login_person(&engineer, &Password::new(password))
        .map_err(|error| format!("logging in {engineer}: {error}"))?;
    for bundle in bundles {
        let digest = store
            .import(&session, std::path::Path::new(bundle))
            .map_err(|error| format!("importing {bundle}: {error}"))?;
        println!("{bundle} {digest}");
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("anet-home-import: {error}");
            ExitCode::FAILURE
        }
    }
}
