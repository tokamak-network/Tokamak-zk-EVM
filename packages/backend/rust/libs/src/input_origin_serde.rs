use crate::input_origin::SubcircuitLibraryOrigin;
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::str::FromStr;

impl Serialize for SubcircuitLibraryOrigin {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for SubcircuitLibraryOrigin {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::from_str(&value).map_err(D::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use crate::input_origin::SubcircuitLibraryOrigin;

    #[test]
    fn serializes_and_deserializes_canonical_input_origins() {
        assert_eq!(
            serde_json::to_string(&SubcircuitLibraryOrigin::NpmSnapshot)
                .expect("origin must serialize"),
            "\"npmSnapshot\""
        );
        assert_eq!(
            serde_json::from_str::<SubcircuitLibraryOrigin>("\"localQapCompiler\"")
                .expect("canonical origin must deserialize"),
            SubcircuitLibraryOrigin::LocalQapCompiler
        );
        assert!(serde_json::from_str::<SubcircuitLibraryOrigin>("\"unknown\"").is_err());
    }
}
