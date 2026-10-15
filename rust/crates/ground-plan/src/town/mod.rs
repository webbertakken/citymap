//! Town layout: cuts, pinwheels, archetypes, neighbourhoods, lots and addresses.
pub mod connectors;
pub mod context;
pub mod cut;
pub mod grid;
pub mod layout;
pub mod neighbourhood;
pub mod partition;

#[cfg(test)]
mod golden;

#[cfg(test)]
mod branches;
