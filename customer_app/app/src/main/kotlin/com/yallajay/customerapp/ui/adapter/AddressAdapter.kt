package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.yallajay.customerapp.databinding.ItemAddressBinding
import com.yallajay.customerapp.model.CustomerAddress

class AddressAdapter(
    private var addresses: List<CustomerAddress>,
    private var selectedAddressId: Int,
    private val onAddressSelected: (CustomerAddress) -> Unit,
    private val onEditClicked: (CustomerAddress) -> Unit
) : RecyclerView.Adapter<AddressAdapter.AddressViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AddressViewHolder {
        val binding = ItemAddressBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return AddressViewHolder(binding, onAddressSelected, onEditClicked)
    }

    override fun onBindViewHolder(holder: AddressViewHolder, position: Int) {
        holder.bind(addresses[position], selectedAddressId)
    }

    override fun getItemCount(): Int = addresses.size
    
    fun getSelectedAddressId(): Int {
        return selectedAddressId
    }

    fun updateData(newAddresses: List<CustomerAddress>, newSelectedId: Int) {
        this.addresses = newAddresses
        this.selectedAddressId = newSelectedId
        notifyDataSetChanged()
    }

    class AddressViewHolder(
        private val binding: ItemAddressBinding,
        private val onAddressSelected: (CustomerAddress) -> Unit,
        private val onEditClicked: (CustomerAddress) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(address: CustomerAddress, selectedAddressId: Int) {
            binding.addressLabelTextView.text = address.addressLabel ?: "عنوان"
            binding.fullAddressTextView.text = address.fullAddress
            binding.addressRadioButton.isChecked = (address.id == selectedAddressId)

            binding.root.setOnClickListener {
                onAddressSelected(address)
            }
            binding.addressRadioButton.setOnClickListener {
                onAddressSelected(address)
            }
            binding.editAddressButton.setOnClickListener {
                onEditClicked(address)
            }
        }
    }
}
