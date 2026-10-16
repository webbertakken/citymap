//! Town layout: cuts, pinwheels, archetypes, neighbourhoods, lots and addresses.
pub mod archipelago;
pub mod connectors;
pub mod context;
pub mod corridor;
pub mod cut;
pub mod grid;
pub mod layout;
pub mod neighbourhood;
pub mod partition;
pub mod quarters;
pub mod waterway;

#[cfg(test)]
mod golden;

#[cfg(test)]
mod branches;

#[cfg(test)]
mod toggled;
